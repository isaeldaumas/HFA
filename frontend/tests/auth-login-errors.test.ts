import assert from 'node:assert/strict'
import test from 'node:test'
import { AUTH_UNAVAILABLE_MESSAGE, getLoginErrorMessage } from '../src/lib/auth-login-errors'

test('failed network and backend errors never masquerade as invalid credentials', () => {
  assert.equal(getLoginErrorMessage({ name: 'AuthRetryableFetchError', status: 0 }), AUTH_UNAVAILABLE_MESSAGE)
  assert.equal(getLoginErrorMessage({ status: 503 }), AUTH_UNAVAILABLE_MESSAGE)
  assert.equal(getLoginErrorMessage(undefined), AUTH_UNAVAILABLE_MESSAGE)
})

test('invalid credentials and unconfirmed email receive specific messages', () => {
  assert.match(getLoginErrorMessage({ code: 'invalid_credentials', status: 400 }), /senha incorretos/)
  assert.match(getLoginErrorMessage({ code: 'email_not_confirmed', status: 400 }), /Confirme/)
})

test('rate limiting and unknown errors are not incorrectly labeled as wrong passwords', () => {
  assert.match(getLoginErrorMessage({ code: 'over_request_rate_limit', status: 429 }), /Muitas tentativas/)
  assert.match(getLoginErrorMessage({ status: 400, code: 'unexpected_failure' }), /Não foi possível/)
})
