#!/usr/bin/env python3
"""Real PostgreSQL V31 concurrency/rollback test with SYNTHETIC data only.

Allows either an isolated Unix socket under /private/tmp/hfa-v31-postgres-isolated-
or an explicitly marked GitHub Actions service on 127.0.0.1:55439 using the
nonsecret synthetic test password. No real Supabase project is accepted.
"""
from __future__ import annotations
import concurrent.futures
import json
import os
from pathlib import Path
import shutil
import subprocess
import uuid

SOCKET = os.environ.get("HFA_V31_PG_SOCKET", "")
HOST = os.environ.get("HFA_V31_PG_HOST", "")
PORT = os.environ.get("HFA_V31_PG_PORT", "55439")
DB = "hfa_v31_synthetic"
CI = os.environ.get("HFA_V31_CI_SYNTHETIC_POSTGRES") == "YES"

if SOCKET and not CI and SOCKET.startswith("/private/tmp/hfa-v31-postgres-isolated-") and (
    SOCKET.endswith("/socket") and Path(SOCKET).is_dir()
) and PORT == "55439" and not HOST:
    ENDPOINT = SOCKET
    OWNER = None
    UNIX = True
elif CI and not SOCKET and HOST == "127.0.0.1" and PORT == "55439" and (
    os.environ.get("PGPASSWORD") == "local-v31-synthetic-only"
):
    ENDPOINT = HOST
    OWNER = "postgres"
    UNIX = False
else:
    raise SystemExit("REFUSING_NONLOCAL_OR_NON_SYNTHETIC_DATABASE")

PSQL = shutil.which("psql")
if not PSQL:
    raise SystemExit("LOCAL_POSTGRES_CLIENT_MISSING")
COUNTS = {"passed": 0, "failed": 0}

def ident(value: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, "hfa-v31-synthetic-" + value))

def sql(query: str, user: str | None = None, expected: bool = True) -> str:
    command = [
        PSQL, "-X", "-At", "-v", "ON_ERROR_STOP=1", "-h", ENDPOINT,
        "-p", PORT, "-d", DB,
    ]
    if user or OWNER:
        command.extend(["-U", user or OWNER])
    command.extend(["-c", query])
    result = subprocess.run(command, capture_output=True, text=True, timeout=20)
    if expected and result.returncode != 0:
        raise AssertionError("LOCAL_PG_QUERY_FAILED: " + result.stderr[-800:])
    if not expected and result.returncode == 0:
        raise AssertionError("EXPECTED_LOCAL_PG_REJECTION")
    return (result.stdout if expected else result.stderr).strip()

def check(cond: bool, label: str) -> None:
    if not cond:
        COUNTS["failed"] += 1
        raise AssertionError(label)
    COUNTS["passed"] += 1

def create_tenant(key: str, balance: int, plan: str = "basic",
                  trial_expired: bool = False, event_count: int = 1):
    tenant, user = ident(key + "-tenant"), ident(key + "-user")
    events = [ident(key + "-event-" + str(i)) for i in range(event_count)]
    expiry = "now() - interval '1 day'" if trial_expired else "null"
    sql(f"""INSERT INTO public.tenants(id,plan,credits_balance,trial_expires_at)
        VALUES ('{tenant}','{plan}',{balance},{expiry});
        INSERT INTO public.users(id,tenant_id) VALUES ('{user}','{tenant}');
        """ + "".join(
        f"INSERT INTO public.events(id,tenant_id) VALUES ('{event}','{tenant}');"
        for event in events
    ))
    return tenant, user, events

def invoke(tenant: str, user: str, event: str, op: str, action: str = "debit",
           title: str = "synthetic", expected: bool = True):
    query = (
        "SELECT public.hfa_apply_credit_operation_v31("
        f"'{tenant}'::uuid,'{user}'::uuid,'{event}'::uuid,"
        f"'{op}'::uuid,'{action}','{title}')::text;"
    )
    output = sql(query, "service_role", expected=expected)
    return json.loads(output) if expected else output

def balance(tenant: str) -> int:
    return int(sql(f"SELECT credits_balance FROM public.tenants WHERE id='{tenant}'"))

def credits(event: str) -> int:
    return int(sql(f"SELECT credits_used FROM public.events WHERE id='{event}'"))

def ledger(tenant: str, op: str | None = None) -> list[list[str]]:
    cond = f" AND hfa_operation_id = '{op}'::uuid" if op else ""
    rows = sql(
        "SELECT type::text || ':' || amount || ':' || hfa_balance_applied::text "
        f"FROM public.credit_transactions WHERE tenant_id='{tenant}'{cond} ORDER BY created_at,id"
    )
    return [[r] for r in rows.splitlines() if r]

def run() -> None:
    check(sql("SELECT current_database();") == DB, "database identity")
    if UNIX:
        check(sql("SELECT inet_server_addr() IS NULL;") == "t", "Unix socket only")
    else:
        check(sql("SELECT inet_server_addr() = '127.0.0.1'::inet;") == "t",
              "GitHub ephemeral PostgreSQL bound to local loopback")
    privileges = sql("""SELECT
      has_function_privilege('anon','public.hfa_apply_credit_operation_v31(uuid,uuid,uuid,uuid,text,text)','EXECUTE'),
      has_function_privilege('authenticated','public.hfa_apply_credit_operation_v31(uuid,uuid,uuid,uuid,text,text)','EXECUTE'),
      has_function_privilege('service_role','public.hfa_apply_credit_operation_v31(uuid,uuid,uuid,uuid,text,text)','EXECUTE');
    """)
    check(privileges == "f|f|t", "only service_role can execute")
    sql("TRUNCATE public.credit_transactions,public.events,public.users,public.tenants CASCADE;")

    ta, ua, ea = create_tenant("a", 2, event_count=3)
    tb, ub, eb = create_tenant("b", 1)
    tz, uz, ez = create_tenant("zero", 0)
    te, ue, ee = create_tenant("enterprise", -1, plan="enterprise")
    tx, ux, ex = create_tenant("expired", 5, plan="trial", trial_expired=True)
    tc, uc, ec = create_tenant("concurrent", 3, event_count=12)
    ts, us, es = create_tenant("same-event", 3, event_count=3)
    tf, uf, ef = create_tenant("failed-insert", 1)

    op = ident("a-initial-1")
    check(invoke(ta, ua, ea[0], op)["state"] == "applied", "initial debit")
    check(balance(ta) == 1 and credits(ea[0]) == 1, "atomic initial state")
    check(invoke(ta, ua, ea[0], op)["state"] == "already_applied", "debit replay")
    check(balance(ta) == 1 and len(ledger(ta, op)) == 1, "replay does not double-charge")
    check(invoke(ta, ua, ea[0], op, "refund")["state"] == "refunded", "refund")
    check(balance(ta) == 2 and credits(ea[0]) == 0, "refund atomic state")
    check(invoke(ta, ua, ea[0], op, "refund")["state"] == "already_refunded", "refund replay")
    check(balance(ta) == 2 and len(ledger(ta, op)) == 2, "no double refund")
    check(invoke(ta, ua, ea[0], op)["state"] == "already_refunded", "recharge refunded key denied")
    check(invoke(ta, ua, ea[0], ident("a-retry-after-refund"))["state"] == "applied",
          "new attempt can charge after refund")

    check("HFA_CREDIT_OPERATION_CONFLICT" in
          invoke(ta, ua, ea[1], ident("a-retry-after-refund"), expected=False),
          "attempt id may not be reused on another event")
    check("HFA_CREDIT_USER_NOT_AUTHORIZED" in
          invoke(ta, ub, ea[1], ident("wrong-user"), expected=False),
          "foreign-tenant user cannot charge")
    check("HFA_CREDIT_EVENT_NOT_AUTHORIZED" in
          invoke(ta, ua, eb[0], ident("wrong-event"), expected=False),
          "foreign-tenant event cannot charge")

    check("HFA_CREDIT_INSUFFICIENT_BALANCE" in
          invoke(tz, uz, ez[0], ident("no-balance"), expected=False),
          "no negative credit")
    check(balance(tz) == 0 and credits(ez[0]) == 0 and not ledger(tz),
          "insufficient balance leaves no side effects")
    check("HFA_CREDIT_REFUND_WITHOUT_DEBIT" in
          invoke(tb, ub, eb[0], ident("refund-without-debit"), "refund", expected=False),
          "refund requires existing debit")
    check("HFA_CREDIT_TRIAL_EXPIRED" in
          invoke(tx, ux, ex[0], ident("expired-trial"), expected=False), "expired trial rejected")

    oe = ident("enterprise-operation")
    check(invoke(te, ue, ee[0], oe)["state"] == "applied", "enterprise ledger debit")
    check(balance(te) == -1 and credits(ee[0]) == 1, "enterprise sentinel preserved")
    check(invoke(te, ue, ee[0], oe, "refund")["state"] == "refunded", "enterprise refund ledger")
    check(balance(te) == -1 and credits(ee[0]) == 0, "enterprise refund preserves sentinel")

    # Explicitly fail ledger insertion. The tenant and event updates MUST roll back.
    sql("""CREATE OR REPLACE FUNCTION public.synthetic_reject_ledger() RETURNS trigger
       LANGUAGE plpgsql AS $b$
       BEGIN
         IF NEW.description LIKE '%SIMULATED_FAILURE%' THEN
            RAISE EXCEPTION 'SYNTHETIC_LEDGER_FAILURE';
         END IF;
         RETURN NEW;
       END;$b$;
       CREATE TRIGGER synthetic_reject_ledger BEFORE INSERT ON public.credit_transactions
          FOR EACH ROW EXECUTE FUNCTION public.synthetic_reject_ledger();""")
    check("SYNTHETIC_LEDGER_FAILURE" in invoke(
        tf, uf, ef[0], ident("rollback-after-balance-update"),
        title="SIMULATED_FAILURE", expected=False), "DB insertion fails transaction")
    check(balance(tf) == 1 and credits(ef[0]) == 0 and not ledger(tf),
          "ledger failure rolls back balance and event atomically")
    sql("DROP TRIGGER synthetic_reject_ledger ON public.credit_transactions; "
        "DROP FUNCTION public.synthetic_reject_ledger();")

    # Distinct events competing for 3 remaining credits: no lost updates.
    def consume(i: int):
        return invoke(tc, uc, ec[i], ident("concurrent-op-" + str(i)),
                      expected=True) if i < 3 else safe_invoke(
                          tc, uc, ec[i], ident("concurrent-op-" + str(i)))
    def safe_invoke(tenant, user, event, operation):
        try:
            return invoke(tenant, user, event, operation)
        except AssertionError as exc:
            # If SQL rejects because of balance, collect the reason separately.
            return str(exc)

    # Use raw psql results instead of exception text so errors are classified.
    def concurrent_call(i: int):
        statement = ("SELECT public.hfa_apply_credit_operation_v31("
            f"'{tc}'::uuid,'{uc}'::uuid,'{ec[i]}'::uuid,"
            f"'{ident('concurrent-op-' + str(i))}'::uuid,'debit','synthetic')::text;")
        command = [PSQL, "-X","-At","-v","ON_ERROR_STOP=1","-h",ENDPOINT,"-p",PORT,"-d",DB,
                   "-U","service_role","-c",statement]
        result = subprocess.run(command, capture_output=True,text=True,timeout=30)
        if result.returncode == 0:
            return json.loads(result.stdout.strip())["state"]
        if "HFA_CREDIT_INSUFFICIENT_BALANCE" in result.stderr:
            return "insufficient"
        raise AssertionError("Unexpected concurrent error: " + result.stderr[-400:])
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(concurrent_call, range(12)))
    check(results.count("applied") == 3 and results.count("insufficient") == 9,
          "12 concurrent operations consume exactly 3 credits")
    check(balance(tc) == 0 and len(ledger(tc)) == 3, "serialized tenant balance and ledger")
    check(sum(credits(e) for e in ec) == 3, "only 3 event charge claims")

    # Same event, different operation IDs, still only one initial debit.
    def same_event_call(i: int):
        return invoke(ts, us, es[0], ident("same-event-" + str(i)))
    def concurrent_same_event(i: int):
        try:
            return same_event_call(i)["state"]
        except AssertionError as exc:
            if "HFA_CREDIT_EVENT_ALREADY_CHARGED" in str(exc):
                return "event-already-charged"
            raise
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        states = list(pool.map(concurrent_same_event, range(8)))
    check(states.count("applied") == 1 and states.count("event-already-charged") == 7,
          "same-event concurrent first HFA analysis charged once")
    check(balance(ts) == 2 and credits(es[0]) == 1 and len(ledger(ts)) == 1,
          "same event does not double bill")

    # A different event and identical operation UUID: exactly-once debit/refund.
    shared = ident("same-attempt-concurrent")
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        replay = list(pool.map(lambda _: invoke(ts,us,es[1],shared)["state"], range(8)))
    check(replay.count("applied") == 1 and replay.count("already_applied") == 7,
          "same operation UUID idempotent under concurrency")
    check(balance(ts) == 1 and len(ledger(ts,shared)) == 1, "single ledger debit")
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        returns = list(pool.map(lambda _: invoke(ts,us,es[1],shared,"refund")["state"],range(8)))
    check(returns.count("refunded") == 1 and returns.count("already_refunded") == 7,
          "same refund idempotent under concurrency")
    check(balance(ts) == 2 and len(ledger(ts,shared)) == 2 and credits(es[1]) == 0,
          "single compensation and ledger refund")

    # Plan transitions retain unlimited sentinel instead of adding 1 to -1.
    op_transition = ident("a-transition")
    check(invoke(ta,ua,ea[1],op_transition)["state"] == "applied", "basic debit before upgrade")
    sql(f"UPDATE public.tenants SET plan='enterprise',credits_balance=-1 WHERE id='{ta}'")
    check(invoke(ta,ua,ea[1],op_transition,"refund")["state"]=="refunded", "refund after upgrade")
    check(balance(ta) == -1, "refund cannot corrupt enterprise unlimited sentinel")

    print("HFA_V31_LOCAL_POSTGRES_PASS", json.dumps({
        "checks": COUNTS["passed"], "failed": COUNTS["failed"],
        "synthetic_only": True, "remote_writes": 0,
        "privilege": "service_role_only", "concurrency": True,
    }))

if __name__ == "__main__":
    run()
