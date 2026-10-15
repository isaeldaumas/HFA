/** Billing/trial UI is customer-facing. This is a display rule, not an
 * authorization check: credit enforcement remains on the server. */
export function shouldShowConsumerCredits(me: { loading: boolean; isAdmin: boolean; verified: boolean; isUnlimited?: boolean; plan?: string }): boolean {
  return !me.loading && me.verified && !me.isAdmin && !me.isUnlimited && me.plan !== 'enterprise'
}
