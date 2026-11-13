/**
 * An HTTP POST without a payload can arrive at the server as either a null
 * body or an already-ended ReadableStream. Neither is a content submission.
 * Reject any transmitted chunk, even when Content-Length claims zero.
 * Do not parse, store or log request content.
 */
export async function hasUnexpectedPreviewRequestBody(req: Request): Promise<boolean> {
  const length = req.headers.get('content-length')
  if (length !== null && length !== '0') return true
  if (!req.body) return false
  const reader = req.body.getReader()
  try {
    const first = await reader.read()
    return !first.done
  } catch {
    return true
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}
