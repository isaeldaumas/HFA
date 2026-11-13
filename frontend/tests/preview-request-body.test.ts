import assert from 'node:assert/strict'
import test from 'node:test'
import { hasUnexpectedPreviewRequestBody } from '../src/lib/server/preview-request-body'

const url = 'https://synthetic.invalid/api/preview'
const request = (body?: string, headers?: Record<string, string>) =>
  new Request(url, { method: 'POST', ...(body === undefined ? {} : {body}), headers })

test('bodyless POST accepts null body and empty stream', async () => {
  assert.equal(await hasUnexpectedPreviewRequestBody(request()), false)
  assert.equal(await hasUnexpectedPreviewRequestBody(request('')), false)
  assert.equal(await hasUnexpectedPreviewRequestBody(request('', {'content-length': '0'})), false)
})
test('non-empty body and misleading zero length are rejected', async () => {
  assert.equal(await hasUnexpectedPreviewRequestBody(request('secret')), true)
  assert.equal(await hasUnexpectedPreviewRequestBody(request('secret', {'content-length': '0'})), true)
  assert.equal(await hasUnexpectedPreviewRequestBody(request('secret', {'content-length': '6'})), true)
})
test('malformed or oversized declared content length is rejected', async () => {
  for (const value of ['-1','00','x','999999']) {
    assert.equal(await hasUnexpectedPreviewRequestBody(request(undefined, {'content-length': value})), true)
  }
})
test('streamed empty body accepted but streamed chunks rejected', async () => {
  const stream = (value?: Uint8Array) => new ReadableStream<Uint8Array>({
    start(c) {if (value) c.enqueue(value); c.close()},
  })
  const make = (body: ReadableStream<Uint8Array>) =>
    new Request(url, {method:'POST',body,duplex:'half'} as RequestInit & {duplex:'half'})
  assert.equal(await hasUnexpectedPreviewRequestBody(make(stream())), false)
  assert.equal(await hasUnexpectedPreviewRequestBody(make(stream(new Uint8Array([0])))), true)
})
