import assert from 'node:assert/strict'
import { extractSupplementalEvidenceItems } from '../../frontend/src/lib/sera-vnext/evidence/extract-evidence'
import { isEvidenceUsableFor } from '../../frontend/src/lib/sera-vnext/evidence/evidence-sufficiency'

const [perceptionAnswer] = extractSupplementalEvidenceItems({
  items: [{
    evidenceId: 'SUP-P-001',
    statement: 'O mecânico acreditava que a portinhola estava travada e decidiu prosseguir sem nova verificação.',
    linkedQuestionId: 'Q-P-001',
    stage: 'PERCEPTION',
    temporalRelation: 'AT_ESCAPE',
  }],
  directActor: 'maintenance',
  sourceSentenceIndex: 100,
})

assert.equal(perceptionAnswer.clarificationStage, 'PERCEPTION')
const multiAxisWording = { ...perceptionAnswer, supports: ['PERCEPTION', 'OBJECTIVE', 'ACTION'] as const }
assert.equal(isEvidenceUsableFor(multiAxisWording, 'PERCEPTION'), true)
assert.equal(isEvidenceUsableFor(multiAxisWording, 'OBJECTIVE'), false)
assert.equal(isEvidenceUsableFor(multiAxisWording, 'ACTION'), false)

const [postEscapeAnswer] = extractSupplementalEvidenceItems({
  items: [{
    evidenceId: 'SUP-A-001',
    statement: 'Após o pouso, o comandante fechou a portinhola e confirmou o travamento.',
    linkedQuestionId: 'Q-A-001',
    stage: 'ACTION',
    temporalRelation: 'AT_ESCAPE',
  }],
  directActor: 'maintenance',
  sourceSentenceIndex: 101,
})

assert.equal(postEscapeAnswer.clarificationStage, 'ACTION')
assert.equal(postEscapeAnswer.temporalRelation, 'POST_ESCAPE')
assert.equal(postEscapeAnswer.actorRelation, 'CONTEXT_ACTOR')
const actionLikePostEscape = { ...postEscapeAnswer, supports: ['ACTION'] as const }
assert.equal(isEvidenceUsableFor(actionLikePostEscape, 'ACTION'), false)

console.log('PASS clarification evidence scope')
