import assert from 'node:assert/strict'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'

function run(id: string, locale: 'en' | 'pt-BR', narrative: string) {
  return runSeraVNextEngineV0({
    inputId: id, narrative, locale, sourceType: 'synthetic',
    sourceReference: 'post-pr50-precision-recall-v3', requestId: id,
    mode: 'CANDIDATE_ONLY',
    options: { includeDebugTrace: true, requireHumanReview: true },
  })
}
function locks(out: ReturnType<typeof runSeraVNextEngineV0>, id: string) {
  assert.equal(out.selectedCode, null, `${id}: selectedCode`)
  assert.equal(out.releasedCode, null, `${id}: releasedCode`)
  assert.equal(out.finalConclusion, null, `${id}: finalConclusion`)
  assert.equal(out.classifiedOutput, false, `${id}: classifiedOutput`)
  assert.equal(out.readyPromotion, false, `${id}: readyPromotion`)
  assert.equal(out.downstreamAllowed, false, `${id}: downstreamAllowed`)
  assert.equal(out.humanReviewRequired, true, `${id}: humanReviewRequired`)
}
const positives = [
  ['CAL01','en','perception','P-B','The helicopter was approaching the offshore platform at night. The ceiling had been dropping for the past twenty minutes. The copilot mentioned that the horizon was becoming harder to distinguish from the sea surface. The captain acknowledged but continued the approach. Thirty seconds later the helicopter struck the water approximately 400 meters short of the platform.'],
  ['CAL04','pt-BR','perception','P-C','A aeronave estava equipada com um sistema de navegação recentemente atualizado. Durante a subida, ocorreu uma discordância entre os dois computadores de bordo. A mensagem no painel era técnica e a tripulação não havia recebido o treinamento específico para essa versão do sistema. O comandante tentou interpretar o alerta consultando o manual rápido, mas o significado exato da falha não estava claro. Enquanto discutiam as opções, a aeronave desviou da rota e entrou em espaço aéreo restrito.'],
  ['VAL01','en','action','A-B','While cruising toward an offshore rig, the helicopter experienced a chip warning on the main gearbox. The crew referred to the emergency checklist but accidentally selected the procedure for a different warning indication. They carried out the wrong steps for approximately two minutes before realizing the error. By the time they corrected to the proper checklist, the gearbox pressure had dropped below the recovery threshold. The helicopter was forced to ditch.'],
  ['VAL02','pt-BR','perception','P-B','O helicóptero voava baixo sobre o mar em direção a uma embarcação. O vento tinha aumentado e a superfície da água estava escura. O piloto perdeu a noção de altura porque não havia pontos de referência no horizonte. O copiloto tentou alertar, mas o piloto já havia iniciado uma curva que colocou a aeronave em contato com a água.'],
] as const
for (const [id,locale,axis,expected,narrative] of positives) {
  const out=run(id,locale,narrative); const actual=out.axes[axis].proposedCode
  assert.equal(actual, expected, `${id}: expected ${expected}, got ${actual}`); locks(out,id)
}
let out=run('NEG-NIGHT','en','At night, runway and horizon references remained clear. The trained pilot had available instruments but did not perceive the altitude deviation because of distraction and time pressure.')
assert.notEqual(out.axes.perception.proposedCode,'P-B'); locks(out,'NEG-NIGHT')
out=run('NEG-TRAINING','en','The trained and qualified pilot had capability but did not perceive the state; system information was available and correct. The record also notes completion of recurrent training.')
assert.notEqual(out.axes.perception.proposedCode,'P-C'); locks(out,'NEG-TRAINING')
out=run('NEG-FOG','en','Fog was reported near the airport, but visibility at the aircraft remained adequate. The trained pilot had capability but did not perceive the mode state; system information was available and correct.')
assert.notEqual(out.axes.perception.proposedCode,'P-B'); locks(out,'NEG-FOG')
// Actor vocabulary must not pull post-impact narrative back into the escape window.
out=run('NEG-POST-IMPACT-CAPTAIN','en','The aircraft struck terrain. After the impact, the captain stated that he had not understood the warning.')
assert.equal(out.axes.perception.proposedCode,null); locks(out,'NEG-POST-IMPACT-CAPTAIN')
console.log('SERA_POST_PR50_PERCEPTION_PRECISION_RECALL_V3_OK')
