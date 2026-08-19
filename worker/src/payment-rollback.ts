/**
 * Whether a paid-handler response status should free a claimed payment hash.
 * 409 means the payload was already used (claim failed / duplicate) — never rollback.
 * 400 and 5xx after a successful claim should rollback so the client can retry.
 */
export function shouldRollbackClaimOnStatus(status: number): boolean {
  return status !== 409 && status >= 400;
}
