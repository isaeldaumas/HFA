import type { SeraClarificationQuestion } from '../engine-contract'
import type { SeraEngineLocale } from './localization'

type ClarificationBody = {
  stage: SeraClarificationQuestion['stage']
  question: string
  requestedEvidence: string[]
}

const EN: Record<string, ClarificationBody> = {
  P_ROOT: { stage: 'PERCEPTION', question: 'At the escape point, what did the operator believe was happening? Which indications, references, alerts, or information supported that perception?', requestedEvidence: ['operator account', 'available indications/alerts', 'sequence immediately before the escape point'] },
  P_ASSESSMENT: { stage: 'PERCEPTION', question: 'Was the operator assessment of the situation correct at that moment? State what the operator perceived and what was actually happening.', requestedEvidence: ['declared/observable perception', 'actual operational state at the same moment'] },
  P_CAPABILITY: { stage: 'PERCEPTION', question: 'Was there any sensory/perceptual limitation or lack of knowledge/familiarity that prevented correct interpretation of the situation? What evidence demonstrates it?', requestedEvidence: ['sensory/environmental condition', 'explicitly documented training/familiarity/knowledge'] },
  P_TIME_PRESSURE: { stage: 'PERCEPTION', question: 'Was there excessive time pressure before the escape point? What concrete urgency, deadline, or operational window existed?', requestedEvidence: ['observable time constraint', 'effect of urgency on situation assessment'] },
  P_INFORMATION_AMBIGUOUS: { stage: 'PERCEPTION', question: 'Was the information presented to the operator ambiguous, illusory, or conflicting? Which signals or sources were available?', requestedEvidence: ['content of sources/signals', 'conflicts or ambiguities between information sources'] },
  P_INFORMATION_AVAILABLE: { stage: 'PERCEPTION', question: 'Was the required information available and correct before the escape point? Where was it presented, and was it monitored or cross-checked?', requestedEvidence: ['information available before the escape point', 'monitoring/cross-check performed or omitted'] },
  O_ROOT: { stage: 'OBJECTIVE', question: 'What concrete intention or objective did the actor have at the escape point?', requestedEvidence: ['declared objective', 'observable decision or intention before the action'] },
  O_RULES: { stage: 'OBJECTIVE', question: 'Did the actor know the applicable rule, procedure, or limit and know whether the chosen objective was consistent with it?', requestedEvidence: ['applicable rule/procedure', 'evidence of actor knowledge and awareness'] },
  O_ROUTINE: { stage: 'OBJECTIVE', question: 'If there was a conscious deviation, was it a habitual/normalized practice or an exceptional decision in this event?', requestedEvidence: ['history of repetition/tolerance', 'evidence of routine or exceptional character'] },
  O_MANAGED_RISK: { stage: 'OBJECTIVE', question: 'What risk did the objective accept, and how did the actor intend to manage or limit it? Was there operational, productivity, or time pressure?', requestedEvidence: ['risk known at the time', 'operational goal pursued', 'risk limitation/management measures'] },
  A_ROOT: { stage: 'ACTION', question: 'What concrete action or omission did the actor perform to try to achieve the objective at the escape point?', requestedEvidence: ['observable command/action/omission', 'link between actor and action'] },
  A_IMPLEMENTED: { stage: 'ACTION', question: 'Did the executed action correspond to what the actor intended to do? Was there a slip, lapse, execution error, or omission?', requestedEvidence: ['intended action', 'actually executed action', 'difference between intention and execution'] },
  A_CORRECT: { stage: 'ACTION', question: 'Was the selected action appropriate to the perceived situation? What alternatives were operationally available at that moment?', requestedEvidence: ['selected action', 'operationally available alternatives', 'appropriateness to perceived situation'] },
  A_CAPABILITY: { stage: 'ACTION', question: 'Did the actor have the capability, knowledge, and skill to execute the appropriate response? What evidence supports the answer?', requestedEvidence: ['relevant qualification/capability', 'physical, ergonomic, knowledge, or skill limitation'] },
  A_TIME_PRESSURE: { stage: 'ACTION', question: 'Was action execution affected by excessive time pressure? What was the urgency and how did it change response selection or timing?', requestedEvidence: ['time constraint', 'timing of the action', 'concrete effect of urgency'] },
}

export function englishClarificationForNode(nodeId: string): ClarificationBody | null {
  return EN[nodeId] ?? null
}

export function clarificationWhyNeeded(nodeId: string, locale: SeraEngineLocale): string {
  return locale === 'pt-BR'
    ? 'A evidência disponível não permite responder o nó canônico ' + nodeId + ' sem inferência.'
    : 'The available evidence does not allow the canonical node ' + nodeId + ' to be answered without inference.'
}
