import type { SeraVNextClarificationResponse } from './types'

// An explicit lack-of-knowledge answer is a reviewer finding, not new causal
// evidence that should be fed back to the engine as if it established an actor.
export function hasNoNewActorEvidence(questions: { id: string; stage: string }[], responses: SeraVNextClarificationResponse[]): boolean {
  const actorQuestions = new Set(questions.filter((q) => q.stage === 'DIRECT_ACTOR').map((q) => q.id))
  return responses.length > 0 && responses.every(({ questionId, response }) =>
    actorQuestions.has(questionId) && /(?:não há evidência suficiente para determinar|não (?:é possível|se pode) (?:determinar|identificar)|não (?:identifica|individualiza) (?:qual|quem|o ator|os papéis)|informações? insuficientes? para (?:determinar|identificar))/iu.test(response),
  )
}
