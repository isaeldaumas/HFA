// error-sanitization-trial-001.ts
// Verifica estaticamente que os envelopes de erro estão corretamente sanitizados
// e que as funções críticas não retornam String(e) bruto.

import * as fs from 'fs'
import * as path from 'path'

let passed = 0
let failed = 0

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS: ${label}`)
    passed++
  } else {
    console.error(`  FAIL: ${label}`)
    failed++
  }
}

function readFile(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../../', relPath), 'utf-8')
}

console.log('\n=== error-sanitization-trial-001 ===\n')

// --- /api/org/intelligence ---
console.log('1. /api/org/intelligence')
const intelligence = readFile('frontend/src/app/api/org/intelligence/route.ts')

assert(!intelligence.includes('jsonError(String(e)'), 'Sem jsonError(String(e)) bruto')
assert(intelligence.includes("'INTELLIGENCE_ERROR'"), 'Usa código de erro interno')
assert(intelligence.includes('requestId'), 'Retorna requestId no erro')
assert(intelligence.includes('x-deprecated-use'), 'Header deprecated presente')
assert(!intelligence.includes('e.stack'), 'Sem stack trace na resposta')

// --- /api/analyze ---
console.log('\n2. /api/analyze')
const analyze = readFile('frontend/src/app/api/analyze/route.ts')

assert(!analyze.includes('return jsonError(String(e)'), 'Sem return jsonError(String(e)) no catch final')
assert(analyze.includes("'Não foi possível concluir a análise.'"), 'Mensagem pública estável em /api/analyze')
assert(analyze.includes('buildErrorResponse'), 'Usa buildErrorResponse para erros estruturados')
assert(analyze.includes('ANALYZE_INVALID_INPUT'), 'Usa ANALYZE_INVALID_INPUT')
assert(analyze.includes('ANALYZE_UNAUTHORIZED'), 'Usa ANALYZE_UNAUTHORIZED')
assert(analyze.includes('ANALYZE_FORBIDDEN'), 'Usa ANALYZE_FORBIDDEN')
assert(analyze.includes('ANALYZE_ENGINE_UNAVAILABLE'), 'Usa ANALYZE_ENGINE_UNAVAILABLE')
assert(analyze.includes('ANALYZE_PERSISTENCE_ERROR'), 'Usa ANALYZE_PERSISTENCE_ERROR')
assert(analyze.includes('ANALYZE_INTERNAL_ERROR'), 'Usa ANALYZE_INTERNAL_ERROR')
assert(!analyze.includes('String(err)'), 'Sem String(err) em /api/analyze')
assert(!analyze.includes('String(e)'), 'Sem String(e) em /api/analyze')
assert(!analyze.includes('error.message'), 'Sem error.message bruto em /api/analyze')

// --- Product Beta handler ---
console.log('\n3. Product Beta api-handlers')
const handlers = readFile('frontend/src/lib/sera-vnext-product/api-handlers.ts')

assert(handlers.includes('SeraVNextProductError'), 'Usa SeraVNextProductError tipado')
assert(handlers.includes("'Erro interno SERA 0.3'"), 'Mensagem sanitizada no catch genérico')
assert(!handlers.includes('String(error)'), 'Sem String(error) em respostas de API')
assert(handlers.includes('request_id'), 'Retorna request_id nos erros')

// --- Sem stack trace em respostas ---
console.log('\n4. Sem vazamento de stack nas respostas (log interno é aceitável)')
const riskProfileRoute = readFile('frontend/src/app/api/risk-profile/route.ts')
// Stack pode aparecer em console.error interno mas não em NextResponse.json()
assert(!riskProfileRoute.includes('NextResponse.json({ stack'), 'risk-profile: stack não na resposta JSON')
assert(!riskProfileRoute.includes(', stack:'), 'risk-profile: stack não embutido em resposta de erro')
assert(riskProfileRoute.includes('logRiskProfileError'), 'risk-profile: usa logger interno sanitizado')
assert(riskProfileRoute.includes('jsonError('), 'risk-profile: usa jsonError para respostas de erro')

console.log(`\n=== Resultado: ${passed} PASS, ${failed} FAIL ===\n`)
if (failed > 0) process.exit(1)
