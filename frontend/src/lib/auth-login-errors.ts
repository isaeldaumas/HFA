/** Safe, user-facing messages for Supabase Auth failures. Never expose raw backend errors. */
export type LoginErrorLike = {
  code?: string
  name?: string
  status?: number
}

export const AUTH_UNAVAILABLE_MESSAGE =
  'O serviço de autenticação está indisponível. Tente novamente em alguns instantes.'

export function getLoginErrorMessage(error: LoginErrorLike | null | undefined): string {
  if (!error || error.name === 'AuthRetryableFetchError' || error.status === 0 || (error.status !== undefined && error.status >= 500)) {
    return AUTH_UNAVAILABLE_MESSAGE
  }

  if (error.code === 'email_not_confirmed') {
    return 'Confirme seu endereço de e-mail antes de entrar.'
  }

  if (error.status === 429 || error.code === 'over_request_rate_limit') {
    return 'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.'
  }

  if (error.code === 'invalid_credentials') {
    return 'E-mail ou senha incorretos. Confira os dados e tente novamente.'
  }

  return 'Não foi possível entrar. Tente novamente ou procure o suporte.'
}
