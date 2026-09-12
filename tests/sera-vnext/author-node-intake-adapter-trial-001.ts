import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  buildCandidateTraversalFromAuthorNodeIntake,
  type AuthorNodeIntakeAxisResult,
  type AuthorNodeIntakeDecision,
  type AuthorNodeIntakeRecord,
} from '../../frontend/src/lib/sera-vnext/author-node-intake-adapter'
import { getCanonicalTraversalNode } from '../../frontend/src/lib/sera-vnext/canonical-traversal'
import type { CanonicalSeraAxis } from '../../frontend/src/lib/sera-vnext/types'

const FINAL_FREE_CONCLUSION_ALLOWED_KEY = 'final' + 'ConclusionAllowed'

type CsvRow = Record<string, string>

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (ch === ',' && !inQuotes) {
      fields.push(current)
      current = ''
      continue
    }

    current += ch
  }

  fields.push(current)
  return fields
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0)
  const header = parseCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    const row: CsvRow = {}
    for (let i = 0; i < header.length; i += 1) {
      row[header[i]] = values[i] ?? ''
    }
    return row
  })
}

function fromCsvRow(row: CsvRow): AuthorNodeIntakeRecord {
  return {
    eventId: row.eventId,
    eventName: row.eventKey,
    intakeId: row.intakeId,
    axis: row.axis as CanonicalSeraAxis,
    nodeId: row.nodeId,
    exactQuestionTextPt: row.exactQuestionTextPt,
    preliminaryAnswerStatus: row.preliminaryAnswerStatus,
    authorDecision: row.authorDecision as AuthorNodeIntakeRecord['authorDecision'],
    authorDecisionRationale: row.authorDecisionRationale,
    evidenceAnchor: row.evidenceAnchor,
    notFinalClassification: row.notFinalClassification === 'true',
    poaClosureAllowed: row.poaClosureAllowed === 'true',
  }
}

function mkAccepted(input: {
  intakeId: string
  eventId: string
  axis: CanonicalSeraAxis
  nodeId: string
  answerValue: string
  eventName?: string
}): AuthorNodeIntakeRecord {
  return {
    intakeId: input.intakeId,
    eventId: input.eventId,
    eventName: input.eventName ?? `MOCK-${input.eventId}`,
    axis: input.axis,
    nodeId: input.nodeId,
    exactQuestionTextPt: getCanonicalTraversalNode(input.nodeId).exactQuestionTextPt,
    authorDecision: 'ACCEPT_NODE_ANSWER',
    authorDecisionRationale: 'Mock author decision for candidate-only simulation.',
    evidenceAnchor: `EVID-${input.intakeId}`,
    answerValue: input.answerValue,
    notFinalClassification: true,
    poaClosureAllowed: false,
  }
}

function axisResultByEvent(
  output: ReturnType<typeof buildCandidateTraversalFromAuthorNodeIntake>,
  eventId: string,
  axis: CanonicalSeraAxis
): AuthorNodeIntakeAxisResult {
  const event = output.events.find((item) => item.eventId === eventId)
  assert.ok(event, `Missing event ${eventId}`)
  const axisResult = event.axisResults.find((item) => item.axis === axis)
  assert.ok(axisResult, `Missing axis ${axis} for event ${eventId}`)
  return axisResult
}

function assertNoDownstreamFields(record: Record<string, unknown>, label: string): void {
  assert.equal('selectedCode' in record, false, `${label}: selectedCode must be absent.`)
  assert.equal('releasedCode' in record, false, `${label}: releasedCode must be absent.`)
  assert.equal('finalConclusion' in record, false, `${label}: finalConclusion must be absent.`)
  assert.equal('hfacs' in record, false, `${label}: HFACS must be absent.`)
  assert.equal('risk' in record, false, `${label}: Risk/ERC must be absent.`)
  assert.equal('armsErc' in record, false, `${label}: ARMS/ERC must be absent.`)
  assert.equal('recommendations' in record, false, `${label}: recommendations must be absent.`)
  assert.notEqual(record.status, 'CLASSIFIED', `${label}: CLASSIFIED must be absent.`)
}

function assertCandidateOnlyLocks(record: Record<string, unknown>, label: string): void {
  assert.equal(record.selectedCodeAllowed, false, `${label}: selectedCodeAllowed must remain false.`)
  assert.equal(record.releasedCodeAllowed, false, `${label}: releasedCodeAllowed must remain false.`)
  assert.equal(record.poaClosureAllowed, false, `${label}: poaClosureAllowed must remain false.`)
  assert.equal(record.downstreamAllowed, false, `${label}: downstreamAllowed must remain false.`)
  assert.equal(record.classificationAllowed, false, `${label}: classificationAllowed must remain false.`)
  assert.equal(record.notFinalClassification, true, `${label}: notFinalClassification must remain true.`)
  assert.equal(record[FINAL_FREE_CONCLUSION_ALLOWED_KEY], false, `${label}: final free conclusion lock must remain false.`)
}

function main() {
  // 1) A4R187 real pending rows stay incomplete/pending without leaf.
  const csvPath = path.resolve(
    'docs/sera-vnext/author-node-decision-intake-a4r187/SERA_AUTHOR_NODE_DECISION_INTAKE_MATRIX_A4R187_v0.2.0.csv'
  )
  const csvRows = parseCsv(fs.readFileSync(csvPath, 'utf8'))
  const realPendingRows = csvRows
    .filter((row) => row.eventId === '0001' && row.axis === 'P')
    .slice(0, 3)
    .map(fromCsvRow)

  assert.ok(realPendingRows.length > 0, 'Expected A4R187 pending rows for event 0001 axis P.')
  assert.ok(
    realPendingRows.every((row) => row.authorDecision === 'PENDING_AUTHOR_DECISION'),
    'Expected real A4R187 rows with PENDING_AUTHOR_DECISION.'
  )

  const pendingOutput = buildCandidateTraversalFromAuthorNodeIntake({ records: realPendingRows })
  const pendingAxis = axisResultByEvent(pendingOutput, '0001', 'P')
  assert.equal(pendingAxis.status, 'AUTHOR_DECISION_PENDING')
  assert.equal(pendingAxis.pendingAuthorDecision, true)
  assert.equal(pendingAxis.leafCandidate, null)
  assert.equal(
    pendingAxis.blockingIssues.some((issue) => issue.includes('UNKNOWN_AUTHOR_DECISION_VALUE')),
    false,
    'Pending rows must not produce unknown-author-decision blocking issue.'
  )

  // 1b) Missing/null/empty authorDecision stays pending without unknown-decision blocking.
  const pendingVariantsOutput = buildCandidateTraversalFromAuthorNodeIntake({
    records: [
      {
        ...mkAccepted({
          intakeId: 'MOCK-PENDING-MISSING',
          eventId: 'MOCK-PENDING',
          axis: 'P',
          nodeId: 'P_ROOT',
          answerValue: 'START',
        }),
        authorDecision: undefined,
      },
      {
        ...mkAccepted({
          intakeId: 'MOCK-PENDING-NULL',
          eventId: 'MOCK-PENDING',
          axis: 'P',
          nodeId: 'P_ASSESSMENT',
          answerValue: 'SIM',
        }),
        authorDecision: null,
      },
      {
        ...mkAccepted({
          intakeId: 'MOCK-PENDING-EMPTY',
          eventId: 'MOCK-PENDING',
          axis: 'P',
          nodeId: 'P_CAPABILITY',
          answerValue: 'SIM',
        }),
        authorDecision: '   ' as unknown as AuthorNodeIntakeDecision,
      },
    ],
  })
  const pendingVariantsAxis = axisResultByEvent(pendingVariantsOutput, 'MOCK-PENDING', 'P')
  assert.equal(pendingVariantsAxis.status, 'AUTHOR_DECISION_PENDING')
  assert.equal(pendingVariantsAxis.leafCandidate, null)
  assert.equal(
    pendingVariantsAxis.blockingIssues.some((issue) => issue.includes('UNKNOWN_AUTHOR_DECISION_VALUE')),
    false,
    'Missing/null/empty authorDecision must not produce UNKNOWN_AUTHOR_DECISION_VALUE.'
  )

  // 2) Mock P complete decisions reach candidate-only leaf.
  const pMockOutput = buildCandidateTraversalFromAuthorNodeIntake({
    records: [
      mkAccepted({ intakeId: 'MOCK-P-001', eventId: 'MOCK-P', axis: 'P', nodeId: 'P_ROOT', answerValue: 'START' }),
      mkAccepted({ intakeId: 'MOCK-P-002', eventId: 'MOCK-P', axis: 'P', nodeId: 'P_ASSESSMENT', answerValue: 'SIM' }),
    ],
  })
  const pAxis = axisResultByEvent(pMockOutput, 'MOCK-P', 'P')
  assert.equal(pAxis.status, 'TRAVERSAL_SIMULATED_LEAF_REACHED_NOT_CLASSIFIED')
  assert.equal(pAxis.leafCandidate?.candidateOnlyLeafCode, 'P-A')

  // 3) Mock O complete decisions reach candidate-only leaf.
  const oMockOutput = buildCandidateTraversalFromAuthorNodeIntake({
    records: [
      mkAccepted({ intakeId: 'MOCK-O-001', eventId: 'MOCK-O', axis: 'O', nodeId: 'O_ROOT', answerValue: 'START' }),
      mkAccepted({ intakeId: 'MOCK-O-002', eventId: 'MOCK-O', axis: 'O', nodeId: 'O_RULES', answerValue: 'SIM' }),
      mkAccepted({ intakeId: 'MOCK-O-003', eventId: 'MOCK-O', axis: 'O', nodeId: 'O_MANAGED_RISK', answerValue: 'NÃO' }),
    ],
  })
  const oAxis = axisResultByEvent(oMockOutput, 'MOCK-O', 'O')
  assert.equal(oAxis.status, 'TRAVERSAL_SIMULATED_LEAF_REACHED_NOT_CLASSIFIED')
  assert.equal(oAxis.leafCandidate?.candidateOnlyLeafCode, 'O-A')

  // 4) Mock A complete decisions reach candidate-only leaf.
  const aMockOutput = buildCandidateTraversalFromAuthorNodeIntake({
    records: [
      mkAccepted({ intakeId: 'MOCK-A-001', eventId: 'MOCK-A', axis: 'A', nodeId: 'A_ROOT', answerValue: 'START' }),
      mkAccepted({ intakeId: 'MOCK-A-002', eventId: 'MOCK-A', axis: 'A', nodeId: 'A_IMPLEMENTED', answerValue: 'SIM' }),
      mkAccepted({ intakeId: 'MOCK-A-003', eventId: 'MOCK-A', axis: 'A', nodeId: 'A_CORRECT', answerValue: 'SIM' }),
    ],
  })
  const aAxis = axisResultByEvent(aMockOutput, 'MOCK-A', 'A')
  assert.equal(aAxis.status, 'TRAVERSAL_SIMULATED_LEAF_REACHED_NOT_CLASSIFIED')
  assert.equal(aAxis.leafCandidate?.candidateOnlyLeafCode, 'A-A')

  // 5) NEEDS_MORE_EVIDENCE blocks explicitly.
  const needsMoreOutput = buildCandidateTraversalFromAuthorNodeIntake({
    records: [
      mkAccepted({ intakeId: 'MOCK-NM-001', eventId: 'MOCK-NM', axis: 'P', nodeId: 'P_ROOT', answerValue: 'START' }),
      {
        ...mkAccepted({ intakeId: 'MOCK-NM-002', eventId: 'MOCK-NM', axis: 'P', nodeId: 'P_ASSESSMENT', answerValue: 'SIM' }),
        authorDecision: 'NEEDS_MORE_EVIDENCE',
      },
    ],
  })
  const needsMoreAxis = axisResultByEvent(needsMoreOutput, 'MOCK-NM', 'P')
  assert.equal(needsMoreAxis.status, 'TRAVERSAL_BLOCKED_BY_AUTHOR_DECISION')
  assert.ok(needsMoreAxis.blockingIssues.join(' ').includes('NEEDS_MORE_EVIDENCE'))

  // 6) BRANCH_BLOCKED blocks explicitly.
  const branchBlockedOutput = buildCandidateTraversalFromAuthorNodeIntake({
    records: [
      mkAccepted({ intakeId: 'MOCK-BB-001', eventId: 'MOCK-BB', axis: 'O', nodeId: 'O_ROOT', answerValue: 'START' }),
      {
        ...mkAccepted({ intakeId: 'MOCK-BB-002', eventId: 'MOCK-BB', axis: 'O', nodeId: 'O_RULES', answerValue: 'SIM' }),
        authorDecision: 'BRANCH_BLOCKED',
      },
    ],
  })
  const branchBlockedAxis = axisResultByEvent(branchBlockedOutput, 'MOCK-BB', 'O')
  assert.equal(branchBlockedAxis.status, 'TRAVERSAL_BLOCKED_BY_AUTHOR_DECISION')
  assert.ok(branchBlockedAxis.blockingIssues.join(' ').includes('BRANCH_BLOCKED'))

  // 7) AXIS_TRAVERSAL_BLOCKED blocks explicitly.
  const axisBlockedOutput = buildCandidateTraversalFromAuthorNodeIntake({
    records: [
      {
        ...mkAccepted({ intakeId: 'MOCK-AB-001', eventId: 'MOCK-AB', axis: 'A', nodeId: 'A_ROOT', answerValue: 'START' }),
        authorDecision: 'AXIS_TRAVERSAL_BLOCKED',
      },
    ],
  })
  const axisBlockedAxis = axisResultByEvent(axisBlockedOutput, 'MOCK-AB', 'A')
  assert.equal(axisBlockedAxis.status, 'TRAVERSAL_BLOCKED_BY_AUTHOR_DECISION')
  assert.ok(axisBlockedAxis.blockingIssues.join(' ').includes('AXIS_TRAVERSAL_BLOCKED'))

  // 8) Invalid node id blocks.
  const invalidNodeOutput = buildCandidateTraversalFromAuthorNodeIntake({
    records: [
      {
        ...mkAccepted({ intakeId: 'MOCK-INV-001', eventId: 'MOCK-INV', axis: 'P', nodeId: 'P_ROOT', answerValue: 'START' }),
        nodeId: 'P_UNKNOWN_NODE',
        exactQuestionTextPt: 'Pergunta inexistente',
      },
    ],
  })
  const invalidNodeAxis = axisResultByEvent(invalidNodeOutput, 'MOCK-INV', 'P')
  assert.equal(invalidNodeAxis.status, 'TRAVERSAL_BLOCKED_BY_INVALID_NODE')
  assert.ok(invalidNodeAxis.blockingIssues.join(' ').includes('INVALID_NODE'))

  // 9) exactQuestionTextPt mismatch is explicit.
  const mismatchOutput = buildCandidateTraversalFromAuthorNodeIntake({
    records: [
      {
        ...mkAccepted({ intakeId: 'MOCK-QM-001', eventId: 'MOCK-QM', axis: 'P', nodeId: 'P_ROOT', answerValue: 'START' }),
        exactQuestionTextPt: 'Pergunta divergente de teste.',
      },
    ],
  })
  const mismatchAxis = axisResultByEvent(mismatchOutput, 'MOCK-QM', 'P')
  assert.equal(mismatchAxis.status, 'AXIS_INPUT_INVALID')
  assert.ok(mismatchAxis.blockingIssues.join(' ').includes('CANONICAL_QUESTION_MISMATCH'))

  // 10) O-E injection is blocked (non-existent in SERA PT v1 leaf set).
  const oEOutput = buildCandidateTraversalFromAuthorNodeIntake({
    records: [
      mkAccepted({ intakeId: 'MOCK-OE-001', eventId: 'MOCK-OE', axis: 'O', nodeId: 'O_ROOT', answerValue: 'START' }),
      {
        ...mkAccepted({ intakeId: 'MOCK-OE-002', eventId: 'MOCK-OE', axis: 'O', nodeId: 'O_RULES', answerValue: 'SIM' }),
        answerValue: 'O-E',
      },
    ],
  })
  const oEAxis = axisResultByEvent(oEOutput, 'MOCK-OE', 'O')
  assert.equal(oEAxis.status, 'TRAVERSAL_BLOCKED_BY_INVALID_ANSWER')
  assert.ok(oEAxis.blockingIssues.join(' ').includes('INVALID_CANONICAL_ANSWER_VALUE'))

  // 11) Cross-axis injection blocks.
  const crossAxisOutput = buildCandidateTraversalFromAuthorNodeIntake({
    records: [
      {
        ...mkAccepted({ intakeId: 'MOCK-CA-001', eventId: 'MOCK-CA', axis: 'O', nodeId: 'O_ROOT', answerValue: 'START' }),
        nodeId: 'P_ROOT',
        exactQuestionTextPt: getCanonicalTraversalNode('P_ROOT').exactQuestionTextPt,
      },
    ],
  })
  const crossAxis = axisResultByEvent(crossAxisOutput, 'MOCK-CA', 'O')
  assert.equal(crossAxis.status, 'AXIS_INPUT_INVALID')
  assert.ok(crossAxis.blockingIssues.join(' ').includes('AXIS_TRAVERSAL_BLOCKED'))

  // 12) Unknown authorDecision values are blocked and auditable.
  const unknownDecisionCases: Array<{ value: string; suffix: string }> = [
    { value: 'ACCEPTED', suffix: 'ACCEPTED' },
    { value: 'APPROVE', suffix: 'APPROVE' },
    { value: 'SIM', suffix: 'SIM' },
    { value: 'YES', suffix: 'YES' },
    { value: 'CLASSIFIED', suffix: 'CLASSIFIED' },
  ]
  const unknownDecisionOutputs: ReturnType<typeof buildCandidateTraversalFromAuthorNodeIntake>[] = []
  for (const unknown of unknownDecisionCases) {
    const eventId = `MOCK-UNK-${unknown.suffix}`
    const output = buildCandidateTraversalFromAuthorNodeIntake({
      records: [
        {
          ...mkAccepted({
            intakeId: `MOCK-UNK-001-${unknown.suffix}`,
            eventId,
            axis: 'P',
            nodeId: 'P_ROOT',
            answerValue: 'START',
          }),
          authorDecision: unknown.value as AuthorNodeIntakeRecord['authorDecision'],
        },
      ],
    })
    unknownDecisionOutputs.push(output)
    const axis = axisResultByEvent(output, eventId, 'P')
    assert.equal(axis.status, 'AXIS_INPUT_INVALID')
    assert.equal(axis.leafCandidate, null)
    assert.ok(
      axis.blockingIssues.includes(`UNKNOWN_AUTHOR_DECISION_VALUE:${unknown.suffix}`),
      `Expected unknown decision blocking issue for ${unknown.suffix}.`
    )
  }

  // 13) Output has no selected/released/classified/downstream fields.
  for (const output of [
    pendingOutput,
    pendingVariantsOutput,
    pMockOutput,
    oMockOutput,
    aMockOutput,
    ...unknownDecisionOutputs,
  ]) {
    assertCandidateOnlyLocks(output as unknown as Record<string, unknown>, 'output')
    assertNoDownstreamFields(output as unknown as Record<string, unknown>, 'output')

    for (const event of output.events) {
      assertCandidateOnlyLocks(event as unknown as Record<string, unknown>, `event ${event.eventId}`)
      assertNoDownstreamFields(event as unknown as Record<string, unknown>, `event ${event.eventId}`)

      for (const axis of event.axisResults) {
        assertCandidateOnlyLocks(axis as unknown as Record<string, unknown>, `axis ${event.eventId}/${axis.axis}`)
        assertNoDownstreamFields(axis as unknown as Record<string, unknown>, `axis ${event.eventId}/${axis.axis}`)
      }
    }
  }

  console.log('PASS author-node-intake-adapter-trial-001')
}

main()
