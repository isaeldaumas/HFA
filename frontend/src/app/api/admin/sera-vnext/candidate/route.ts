import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/server/admin-auth";
import type { ApiUserContext } from "@/lib/server/api-auth";
import {
  analyzeSeraVNextCandidateOnly,
  isSeraVNextCandidateOnlyEnabled,
  isSeraVNextInternalPilotEnabled,
  isSeraVNextReadOnlyEnabled,
  SeraVNextCandidateValidationError,
  type SeraVNextCandidateOnlyInput,
  type SeraVNextCandidateOnlyResponse,
} from "@/lib/sera-vnext-runtime";
import { logSeraVNextRuntimeEvent } from "@/lib/sera-vnext-runtime/runtime-observability";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store",
};

type SeraVNextCandidateRouteDeps = {
  requireAdminUser?: (req: Request) => Promise<ApiUserContext>;
  analyzeCandidate?: (args: {
    input: SeraVNextCandidateOnlyInput;
    requestId: string;
  }) => SeraVNextCandidateOnlyResponse;
  isReadOnlyEnabled?: () => boolean;
  isInternalPilotEnabled?: () => boolean;
  isCandidateOnlyEnabled?: () => boolean;
  logEvent?: typeof logSeraVNextRuntimeEvent;
  now?: () => number;
  requestId?: () => string;
};

function responseStatus(error: Response): number {
  return error.status || 500;
}

async function parseRequestBody(req: Request): Promise<SeraVNextCandidateOnlyInput> {
  try {
    return (await req.json()) as SeraVNextCandidateOnlyInput;
  } catch {
    throw new SeraVNextCandidateValidationError(
      "SERA_VNEXT_CANDIDATE_INVALID_JSON",
      "Body JSON inválido."
    );
  }
}

export async function handleSeraVNextCandidateRequest(
  req: Request,
  deps: SeraVNextCandidateRouteDeps = {}
) {
  const requireAdminUser = deps.requireAdminUser ?? requireAdmin;
  const analyzeCandidate = deps.analyzeCandidate ?? analyzeSeraVNextCandidateOnly;
  const isReadOnlyEnabled = deps.isReadOnlyEnabled ?? isSeraVNextReadOnlyEnabled;
  const isInternalPilotEnabled =
    deps.isInternalPilotEnabled ?? isSeraVNextInternalPilotEnabled;
  const isCandidateOnlyEnabled =
    deps.isCandidateOnlyEnabled ?? isSeraVNextCandidateOnlyEnabled;
  const logEvent = deps.logEvent ?? logSeraVNextRuntimeEvent;
  const now = deps.now ?? (() => performance.now());
  const requestId =
    req.headers.get("x-request-id") ?? deps.requestId?.() ?? crypto.randomUUID();
  const started = now();

  if (
    !isReadOnlyEnabled() ||
    !isInternalPilotEnabled() ||
    !isCandidateOnlyEnabled()
  ) {
    logEvent({
      event: "sera_vnext_candidate_assessment_disabled",
      requestId,
      status: "DISABLED",
      durationMs: Math.round(now() - started),
    });
    return NextResponse.json({ detail: "Not found" }, { status: 404, headers: noStoreHeaders });
  }

  try {
    const user = await requireAdminUser(req);
    const input = await parseRequestBody(req);
    logEvent({
      event: "sera_vnext_candidate_assessment_requested",
      requestId,
      tenantId: user.tenantId,
      userRole: user.role,
      inputLength: typeof input.eventText === "string" ? input.eventText.length : undefined,
    });

    const result = analyzeCandidate({ input, requestId });
    logEvent({
      event: "sera_vnext_candidate_assessment_completed",
      requestId,
      tenantId: user.tenantId,
      userRole: user.role,
      status: result.analysisStatus,
      factsCount: result.factualExtraction.facts.length,
      timelineCount: result.factualExtraction.timeline.length,
      analysisStatus: result.analysisStatus,
      treeStatus: result.canonicalTreeStatus,
      inputLength: typeof input.eventText === "string" ? input.eventText.length : undefined,
      durationMs: Math.round(now() - started),
    });
    return NextResponse.json(result, { status: 200, headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof Response) {
      logEvent({
        event: "sera_vnext_candidate_assessment_denied",
        requestId,
        status: String(responseStatus(error)),
        durationMs: Math.round(now() - started),
      });
      return error;
    }

    if (error instanceof SeraVNextCandidateValidationError) {
      logEvent({
        event: "sera_vnext_candidate_assessment_failed",
        requestId,
        status: "INPUT_INVALID",
        errorCode: error.errorCode,
        durationMs: Math.round(now() - started),
      });
      return NextResponse.json(
        { detail: error.message, errorCode: error.errorCode },
        { status: error.status, headers: noStoreHeaders }
      );
    }

    logEvent({
      event: "sera_vnext_candidate_assessment_failed",
      requestId,
      status: "ERROR",
      errorCode: "SERA_VNEXT_CANDIDATE_ROUTE_UNEXPECTED_ERROR",
      durationMs: Math.round(now() - started),
    });
    return jsonError("Erro ao executar sandbox SERA 0.3", 500);
  }
}

export async function POST(req: Request) {
  return handleSeraVNextCandidateRequest(req);
}
