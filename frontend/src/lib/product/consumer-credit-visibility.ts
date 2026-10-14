/** Billing/trial UI is customer-facing. This is a display rule, not an
 * authorization check: credit enforcement remains on the server. */
export function shouldShowConsumerCredits(me: { loading: boolean; isAdmin: boolean }): boolean {
  return !me.loading && !me.isAdmin
}
