/**
 * Offline, self-contained and deliberately NON-BLIND development diagnostics.
 * All content is sourced from synthetic development cases, not V04 holdouts.
 */
import type { createDevelopmentCalibrationReport } from './dev-calibration-workbench'

type Report = ReturnType<typeof createDevelopmentCalibrationReport>
export function escapeDevelopmentHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch] ?? ch))
}

function safeArray(values: string[]): string {
  return values.length
    ? '<ul>' + values.map(value => '<li>' + escapeDevelopmentHtml(value) + '</li>').join('') + '</ul>'
    : '<p class="muted">Nenhuma evidência registrada neste campo.</p>'
}

export function renderDevelopmentCalibrationHtml(report: Report): string {
  if (report.scientificUse !== false || report.scientificValidation !== 'NOT_RUN' ||
    report.methodologicalGate !== 'ENGINE_NATURALISTIC_VALIDATION_NOT_READY' ||
    report.productionAuthorization !== 'NOT_AUTHORIZED' || report.sealedHoldoutExecuted !== false) {
    throw new Error('SCIENTIFIC_PROMOTION_OR_HOLDOUT_CONTENT_FORBIDDEN')
  }
  const pendingIds = new Set(report.pendingHumanReview.map(c => c.caseId))
  const rows = report.cases.map(c => {
    const extra = pendingIds.has(c.caseId)
    const nonLiteral = (['perception', 'objective', 'action'] as const)
      .reduce((sum, axis) => sum + c.actual[axis].nonLiteralSupportingEvidenceCount, 0)
    const sourceAfterAnchor = (['perception', 'objective', 'action'] as const)
      .reduce((sum, axis) => sum + c.sourceAudit[axis].filter(item => item.laterInTextThanAnchor).length, 0)
    const ablation = c.postAnchorAblation
    const heading = escapeDevelopmentHtml(c.caseId + ' · ' + c.locale + ' · ' + c.cohort)
    const axisPanels = (['perception', 'objective', 'action'] as const).map(axis => {
      const a = c.actual[axis]
      const title = axis === 'perception' ? 'Percepção (P)' : axis === 'objective' ? 'Objetivo (O)' : 'Ação (A)'
      return [
        '<section class="axis">',
        '<div class="axis-head"><h4>' + title + '</h4><span class="code">' + escapeDevelopmentHtml(a.code ?? 'SEM CÓDIGO') + '</span></div>',
        '<p class="muted">Status: ' + escapeDevelopmentHtml(a.status) + ' · Confiança: ' + escapeDevelopmentHtml(a.confidence) + '</p>',
        '<p class="small"><b>Trilha:</b> ' + escapeDevelopmentHtml(a.canonicalPath.join(' → ') || 'não disponível') + '</p>',
        '<p class="small"><b>Evidências favoráveis (' + a.evidenceCount + '):</b></p>',
        safeArray(a.supportingEvidenceExcerpts),
        '<p class="small"><b>Contraevidências (' + a.counterEvidenceCount + '):</b></p>',
        safeArray(a.counterEvidenceExcerpts),
        a.nonLiteralSupportingEvidenceCount
          ? '<p class="flag small"><b>Verificar origem textual (' + a.nonLiteralSupportingEvidenceCount +
            '):</b> estas formulações não são trechos literais da narrativa. Isso não implica erro.</p>' +
            safeArray(a.nonLiteralSupportingEvidenceExcerpts)
          : '',
        c.sourceAudit[axis].some(item => item.laterInTextThanAnchor)
          ? '<p class="flag small"><b>Verificar relação temporal:</b> estas evidências estão em frases do relato posteriores ao ponto de fuga; a ordem do texto NÃO prova ordem cronológica.</p><ul>' +
            c.sourceAudit[axis].filter(item => item.laterInTextThanAnchor).map(item =>
              '<li class="small">' + escapeDevelopmentHtml(item.quote) + ' <span class="muted">(frase ' +
              escapeDevelopmentHtml(item.sources.filter(src => src.sourceSentenceIndex > (c.anchorSentenceIndex ?? Infinity)).map(src => String(src.sourceSentenceIndex)).join(', ')) +
              '; relação temporal: ' + escapeDevelopmentHtml(item.sources.map(src => src.temporalRelation).join(', ')) +
              ')</span></li>').join('') + '</ul>'
          : '',
        '<p class="muted small">Trechos excluídos pós-ponto de fuga: ' + a.excludedPostEscapeCount + '</p>',
        '</section>',
      ].join('')
    }).join('')
    const warning = extra
      ? '<p class="flag"><b>Revisão metodológica pendente.</b> Código adicional não pontuado pelo oráculo V03: ' +
        escapeDevelopmentHtml(c.extraUnscoredCodes.map(x => x.axis + '=' + x.code).join(', ')) +
        '. Não aceitar ou rejeitar sem referência independente por eixo.</p>'
      : ''
    return [
      '<details class="case"' + (extra ? ' open' : '') + '>',
      '<summary><span><b>' + heading + '</b><small>Expectativa V03: ' +
       escapeDevelopmentHtml(JSON.stringify(c.expected)) + '</small></span><span class="' +
       (extra ? 'needs' : c.outcome === 'MATCH' ? 'ok' : 'needs') + '">' +
       (extra ? ((ablation && ablation.changedAxes.length > 0) ? 'REVISAR EIXO + SENSÍVEL AO TEXTO POSTERIOR' : 'REVISAR EIXO') : c.outcome !== 'MATCH' ? 'DIVERGÊNCIA' :
         (ablation && ablation.changedAxes.length > 0) ? 'SENSÍVEL AO TEXTO POSTERIOR' :
         sourceAfterAnchor ? 'REVISAR TEMPORALIDADE (' + sourceAfterAnchor + ')' :
         nonLiteral ? 'VERIFICAR ORIGEM (' + nonLiteral + ')' : 'MATCH PARCIAL') + '</span></summary>',
      '<div class="inside">', warning,
      '<p class="muted small">SHA-256 da narrativa: <code>' + escapeDevelopmentHtml(c.narrativeSha256) + '</code></p>',
      '<p class="muted small">Ponto de fuga: ' + escapeDevelopmentHtml(c.escapePointStatus) +
      ' · Suficiência: ' + escapeDevelopmentHtml(c.evidenceSufficiency) + '</p>',
      '<div class="axis-grid">' + axisPanels + '</div>',
      ablation
        ? '<section class="followup"><h4>Teste exploratório de retirada do texto posterior ao ponto de fuga</h4>' +
          '<p class="small"><b>Códigos com narrativa completa:</b> ' + escapeDevelopmentHtml(JSON.stringify(ablation.fullCodes)) +
          ' · <b>Códigos com relato truncado:</b> ' + escapeDevelopmentHtml(JSON.stringify(ablation.prefixCodes)) +
          '</p><p class="small"><b>Eixos modificados:</b> ' +
          escapeDevelopmentHtml(ablation.changedAxes.join(', ') || 'nenhum') +
          ' · Status do ponto de fuga: ' +
          escapeDevelopmentHtml(ablation.originalAnchorStatus + ' → ' + ablation.prefixAnchorStatus) + '</p>' +
          '<p class="muted small">A alteração de códigos após suprimir frases posteriores indica sensibilidade ao contexto textual, e NÃO comprova contaminação causal nem erro de classificação.</p></section>'
        : '',
      '<section class="followup"><h4>Informações que faltam para o motor</h4>',
      '<p class="small"><b>Razões bloqueantes:</b> ' +
      escapeDevelopmentHtml(c.blockingReasons.join(' · ') || 'nenhuma') + '</p>',
      c.clarificationQuestions.length
        ? '<ol>' + c.clarificationQuestions.map(q => '<li><b>' +
          escapeDevelopmentHtml(q.stage + ' · ' + q.id) + '</b>: ' +
          escapeDevelopmentHtml(q.question) +
          '<div class="muted small">Evidência solicitada: ' +
          escapeDevelopmentHtml(q.requestedEvidence.join(' · ')) + '</div></li>').join('') +
          '</ol>'
        : '<p class="muted small">Não há perguntas bloqueantes registradas nesta execução.</p>',
      '</section>',
      '<p class="muted small">Bloqueios: ' +
      escapeDevelopmentHtml(Object.entries(c.guardrails).map(([k,v]) => k + '=' + String(v)).join(' · ')) +
      '</p></div></details>',
    ].join('')
  }).join('\n')

  const agenda = report.pendingHumanReview.length
    ? report.pendingHumanReview.map(c =>
        '<li><b>' + escapeDevelopmentHtml(c.caseId) + '</b>: ' +
        escapeDevelopmentHtml(c.extraUnscoredCodes.map(x => x.axis + '=' + x.code).join(', ')) +
        ' — revisar separadamente, sem alterar a expectativa original.</li>').join('')
    : '<li>Sem códigos adicionais detectados nesta execução; validação humana continua pendente.</li>'
  const css = [
    ':root{color-scheme:dark;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}',
    'body{margin:0;background:#0b1220;color:#e9edf5;line-height:1.5}',
    'main{width:min(1250px,94vw);margin:0 auto;padding:28px 0 70px}',
    '.hero{background:#172236;border:1px solid #354359;border-radius:16px;padding:26px;margin-bottom:18px}',
    'h1{font-size:clamp(1.35rem,3vw,2rem);margin:0 0 8px}h2{font-size:1.15rem}h4{margin:0}',
    '.muted{color:#aab7c9}.small{font-size:.81rem}.flag{padding:12px;background:#3a2a13;border:1px solid #9a6c25;border-radius:9px;color:#ffe1a1}',
    '.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:12px;margin:20px 0}',
    '.metric{background:#151f30;border:1px solid #3b4c63;border-radius:10px;padding:13px}',
    '.metric strong{display:block;font-size:1.55rem}.metric span{color:#b1c0d1;font-size:.85rem}',
    '.case{border:1px solid #38475a;border-radius:11px;background:#111a29;margin:10px 0;overflow:hidden}',
    '.case summary{cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px}',
    '.case summary small{display:block;color:#b6c2d1;font-size:.79rem;margin-top:4px}',
    '.case summary .ok{color:#8de4b8}.case summary .needs{color:#ffcf8e}',
    '.inside{border-top:1px solid #344258;padding:15px 18px}.axis-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}',
    '.axis{padding:12px;background:#18263a;border:1px solid #384960;border-radius:9px;overflow-wrap:anywhere}',
    '.axis-head{display:flex;justify-content:space-between;gap:5px}.code{font-family:monospace;font-weight:700}',
    '.axis ul{padding-left:18px;margin:4px 0}.axis li{font-size:.83rem;margin-bottom:4px}',
    '.followup{margin-top:16px;padding:12px 16px;background:#182235;border:1px solid #425371;border-radius:9px}',
    '.followup ol{padding-left:22px}.followup li{padding:3px 0;font-size:.87rem}',
    'code{overflow-wrap:anywhere}.method{padding:14px 18px;border-left:3px solid #7e9ccd;background:#15243a;margin:20px 0}',
    'a{color:#9ac9ff} @media(max-width:850px){.axis-grid{grid-template-columns:1fr}}',
    '@media print{body{background:white;color:#111}.hero,.case,.axis,.metric,.method{color:#111;background:white}.muted{color:#555}.case summary small{color:#555}}',
  ].join('')
  return [
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="referrer" content="no-referrer">',
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">',
    '<title>HFA · Calibração de desenvolvimento</title><style>', css, '</style></head><body>',
    '<main><header class="hero"><h1>HFA · Calibração de desenvolvimento</h1>',
    '<p class="muted">Relatório offline e sem login, exclusivamente para diagnóstico de casos sintéticos expostos.</p>',
    '<p class="flag"><b>NÃO É validação científica independente.</b> V04 permanece ' +
      escapeDevelopmentHtml(report.methodologicalGate) + '. Não há autorização de produção ou classificação final automática.</p></header>',
    '<section class="stats" aria-label="Indicadores">',
    '<div class="metric"><strong>' + report.metrics.total + '</strong><span>Casos sintéticos de desenvolvimento</span></div>',
    '<div class="metric"><strong>' + report.metrics.match + '/' + report.metrics.total + '</strong><span>Compatíveis com expectativa parcial V03</span></div>',
    '<div class="metric"><strong>' + report.metrics.unscoredAdditionalCodeCases + '</strong><span>Casos com código adicional não julgado</span></div>',
    '<div class="metric"><strong>' + report.metrics.nonLiteralSupportingEvidenceCount + '</strong><span>Formulações de apoio não literais — não presumir erro</span></div>',
    '<div class="metric"><strong>' + report.metrics.afterAnchorSupportingItems + '</strong><span>Evidências de frases posteriores ao ponto de fuga no texto — revisar temporalidade</span></div>',
    '<div class="metric"><strong>' + report.metrics.postAnchorAblationChangedCases + '/' + report.metrics.postAnchorAblationsRun +
      '</strong><span>Casos cujo código muda ao retirar texto posterior — teste exploratório</span></div>',
    '<div class="metric"><strong>' + (report.metrics.evidenceSufficiencyCounts.NEEDS_CLARIFICATION ?? 0) +
      '</strong><span>Casos com pedido de esclarecimento</span></div>',
    '<div class="metric"><strong>' + (report.metrics.criticalGuardrailsPass ? 'PASS' : 'FAIL') + '</strong><span>Bloqueios técnicos testados</span></div>',
    '</section>',
    '<section class="method"><h2>Agenda de revisão por eixo</h2><ul>', agenda,
    '</ul><p class="muted">Não converter ausência de evidência em P-A, O-A ou A-A. O-C exige consciência de regra e desvio pontual; A-F pressupõe seleção de ação errada; A-H envolve temporização. Fontes: matriz de evidência SERA, critérios autorais.</p>',
    '<p class="muted small">Resumo dos motivos de esclarecimento: ' +
      escapeDevelopmentHtml(Object.entries(report.metrics.blockingReasonCounts)
        .sort((a,b) => b[1] - a[1]).slice(0, 8)
        .map(([reason,count]) => reason + ': ' + count).join(' · ')) + '</p>',
    '<p class="muted small">A ordem das frases no documento NÃO equivale automaticamente à sequência temporal. Exige-se comparação com o conteúdo e o ponto de fuga antes de identificar contaminação causal.</p>',
    '<p class="muted small">Os excertos exibidos foram extraídos de casos sintéticos. Esta tela mostra propostas do motor e, portanto, NÃO serve como instrumento de avaliação cega V04.</p>',
    '</section>',
    '<h2>Casos e caminhos de decisão</h2>',
    '<p class="muted small">Abra cada caso para inspecionar P/O/A, evidências e caminhos. A expectativa V03 pode cobrir apenas um dos três eixos.</p>',
    rows,
    '<footer class="muted small"><p>Origem: V03-CAL e V03-VAL, desenvolvimento exposto. 0 casos selados executados. ' +
       'Dados reais, calibragem autoral e validação humana independente: pendentes.</p></footer></main></body></html>',
  ].join('')
}
