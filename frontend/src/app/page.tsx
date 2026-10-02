'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BarChart3, ClipboardCheck, Factory, FileText, Flame, GitBranch, Plane, UploadCloud } from 'lucide-react'

export default function Home() {
  const [showAllReferences, setShowAllReferences] = useState(false)

  const references = [
    'Hendy, K.C. (2003). A Tool for Human Factors Accident Investigation, Classification and Risk Management. Defence R&D Canada, Toronto, DRDC Toronto TR 2002-057.',
    'Hendy, K.C.; Lichacz, F. (1999). Controlling error in the cockpit. Proceedings of the 10th International Symposium on Aviation Psychology, Columbus, OH.',
    'Hendy, K.C.; East, K.P.; Farrell, P.S.E. (2001). An information processing model of operator stress and performance. In P.A. Hancock & P.A. Desmond (Eds.), Stress, Workload and Fatigue: Theory, Research, and Practice.',
    'Hendy, K.C.; Farrell, P.S. (1997). Implementing a model of human information processing in a task network simulation environment. IMED 97-R-71.',
    'Hendy, K.C.; Liao, J.; Milgram, P. (1997). Combining time and intensity effects in assessing operator information processing load. Human Factors, 39(1), 30-47.',
    'Powers, W.T. (1973). Behavior: The Control of Perception. New York: Aldine De Gruyter.',
    'Reason, J. (1990). Human Error. Cambridge: Cambridge University Press.',
    'Shappell, S.A.; Wiegmann, D.A. (2000). The Human Factors Analysis and Classification System - HFACS. DOT/FAA/AM-00/7.',
    'Endsley, M.R. (1993). Situation awareness and workload: Flip sides of the same coin. Proceedings of the 7th International Symposium on Aviation Psychology.',
    'Brittan, D.; Douglas, S. (2009). Offshore crew supply - Modern marine options challenge helicopters. Society of Petroleum Engineers.',
    'Carvalho, P.V.R. (2011). Ferramentas de Ergonomia Cognitiva. In: Ergonomia: Trabalho adequado e eficiente. Rio de Janeiro: Elsevier/ABEPRO.',
    'Carvalho, P.V.R. (2011). Ergonomia Cognitiva. In: Ergonomia: Trabalho adequado e eficiente. Rio de Janeiro: Elsevier/ABEPRO.',
    'Civil Aviation Authority. CAP 720 - Flight Crew Training: Cockpit Resource Management (CRM) and Line-Oriented Flight Training (LOFT). United Kingdom.',
    'Crandall, B.; Klein, G.; Hoffman, R.R. (2006). Incident-Based CTA: Helping Practitioners Tell Stories. In: Working Minds: A Practitioner’s Guide to Cognitive Task Analysis. Cambridge, MA: A Bradford Book.',
    'F.P. Daumas (2018). Análise de Fatores Humanos em Incidentes da Aviação Offshore: Uma Abordagem Cognitiva da Atividade em conjunto com a ferramenta SERA. Dissertação (Mestrado em Engenharia de Produção e Sistemas Computacionais), Universidade Federal Fluminense, Rio das Ostras.',
    'F.P. Daumas; C.L.C. Guizze (2019). Aplicação da análise cognitiva da atividade em articulação com a ferramenta SERA na investigação de incidentes aéreos: uma proposta metodológica. Revista Conexão SIPAER, 10(2), 25-48.',
    'Gomes, J.O.; Woods, D.D.; Carvalho, P.V.R. (2009). Resilience and brittleness in the offshore helicopter transportation system: The identification of constraints and sacrifice decisions in pilots’ work. Reliability Engineering and System Safety, 94(2), 311-319.',
    'Hermeto, N. et al. (2014). Logistics network planning for offshore air transport of oil rig crews. Computers and Industrial Engineering, 75(1), 41-54.',
    'Hoffman, R.R.; Crandall, B.; Shadbolt, N. (1998). Use of the Critical Decision Method to Elicit Expert Knowledge: A Case Study in the Methodology of Cognitive Task Analysis. Human Factors, 40(2), 254-276.',
    'ICAO. Human Factors Digest No. 2 - Flight Crew Training: Cockpit Resource Management (CRM) and Line-Oriented Flight Training (LOFT): Circular 217-AN/132. Montreal.',
    'ICAO. (2013). Safety Management Manual (SMM): AN/474. Montreal: International Civil Aviation Organization.',
    'Inglis, M.; Smithson, M.J.; Cheng, K. (2010). Evaluation of the Human Factors Analysis and Classification System as a predictive model. Aviation Research and Analysis Report AR-2008-036.',
    'Klein, G.A.; Calderwood, R.; MacGregor, D. (1989). Critical decision method for eliciting knowledge. IEEE Transactions on Systems, Man, and Cybernetics, 19(3), 462-472.',
    'Lewis, K.; Spouge, J. (1994). Helicopter or Boats - Risk Management options for transport offshore. SPE Health, Safety and Environment in Oil and Gas Exploration and Production Conference.',
    'Moraes, A. (1998). Ergonomia: um compromisso com a melhoria das condições de trabalho. In: Trabalho e Doença Existencial. Rio de Janeiro: LED/FCS/UERJ.',
    'Moshansky, V.P. (1992). Commission of Inquiry into the Air Ontario Crash at Dryden, Ontario (Canada) Final Report. Canadian Cataloguing in Publication Data.',
    'Nascimento, F.A.C.; Majumdar, A.; Jarvis, S. (2012). Nighttime approaches to offshore installations in Brazil: Safety shortcomings experienced by helicopter pilots. Accident Analysis and Prevention, 47, 64-74.',
    'Oil and Gas UK. UK Offshore Public Transport Helicopter Safety Record 1977-2006.',
    'Qian, F. et al. (2012). Passenger and pilot risk minimization in offshore helicopter transportation. Omega, 40(5), 584-593.',
    'Sefer, E.A. (2015). A model-based safety analysis approach for high-integrity socio-technical component-based systems. Master Thesis, Mälardalen University, Sweden.',
    'Shappell, S.; Wiegmann, D. (1997). A Human Error Approach to Accident Investigation: The Taxonomy of Unsafe Operations. The International Journal of Aviation Psychology, 7(4), 269-291.',
    'Silva, A.L.M.; Correa, E.M.; Vargas, J.C. (2011). Fatores Humanos Contribuintes para Ocorrência de Acidentes nas Operações Offshore. Conexão SIPAER, 2(3), 161-170.',
    'Skogdalen, J.E.; Vinnem, J.E. (2011). Quantitative risk analysis offshore - Human and organizational factors. Reliability Engineering & System Safety, 96(4), 468-479.',
    'Sobreda, S.F. (2011). SERA - Uma Ferramenta para Análise e Classificação do Erro Humano em Acidentes e Incidentes Aeronáuticos. Dissertação de Mestrado Profissional, Instituto Tecnológico da Aeronáutica.',
    'Wiegmann, D.; Shappell, S. A Human Error Approach to Aviation Accident Analysis: The Human Factors Analysis and Classification System. Aldershot, Hants, England.',
  ]

  const visibleReferences = showAllReferences ? references : references.slice(0, 8)

  const relatedWork = [
    {
      title: 'Aplicação prática do mestrado',
      meta: 'F.P. Daumas, 2018 — Engenharia de Produção e Sistemas Computacionais',
      desc: 'O HFA/SERA é fruto aplicado de um trabalho acadêmico: levar a pesquisa sobre MDC + SERA para uma ferramenta utilizável em investigações reais.',
    },
    {
      title: 'Piloto guiado sem cartão',
      meta: '60 dias · até 15 análises',
      desc: 'A empresa pode começar com uma ocorrência já investigada, comparar resultados e testar o HFA com seus próprios dados antes de decidir pela contratação.',
    },
    {
      title: 'Segurança operacional',
      meta: 'Investigação · risco · aprendizagem',
      desc: 'A proposta é melhorar investigação, gerenciamento de risco e segurança operacional em aviação, óleo e gás, indústria, saúde e outros sistemas críticos.',
    },
  ]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500;600&display=swap');

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-up { animation: fadeUp 0.6s ease forwards; }
        .delay-1 { animation-delay: 0.1s; opacity: 0; }
        .delay-2 { animation-delay: 0.2s; opacity: 0; }
        .delay-3 { animation-delay: 0.3s; opacity: 0; }
        .delay-4 { animation-delay: 0.4s; opacity: 0; }
        .delay-5 { animation-delay: 0.5s; opacity: 0; }
        .delay-6 { animation-delay: 0.6s; opacity: 0; }

        .pipeline-card:hover {
          border-color: #3B82F6;
          background-color: #0D1E35;
        }
        .feature-card:hover {
          border-color: #3B82F6;
        }
        .comparison-row:hover {
          background-color: rgba(59,130,246,0.04);
        }
        .research-panel {
          background:
            linear-gradient(180deg, rgba(59,130,246,0.08), rgba(8,16,30,0.72)),
            #0D1A2D;
          border: 1px solid rgba(96,165,250,0.18);
          box-shadow: 0 0 42px rgba(37,99,235,0.08);
        }
        .technical-line {
          background: linear-gradient(90deg, transparent, rgba(96,165,250,0.42), transparent);
        }
        .paper-ref {
          border-left: 2px solid rgba(96,165,250,0.45);
          background: rgba(15,23,42,0.42);
        }
        .logic-card {
          background: linear-gradient(180deg, rgba(15,23,42,0.82), rgba(8,16,30,0.88));
          border: 1px solid rgba(96,165,250,0.16);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
        }
      `}</style>

      <div style={{ fontFamily: "'DM Sans', sans-serif", backgroundColor: '#060B14', color: '#fff', minHeight: '100vh' }}>

        {/* NAVBAR */}
        <nav style={{ backgroundColor: '#060B14', borderBottom: '1px solid rgba(148,163,184,0.12)', position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 32px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
              <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: '22px', color: '#60A5FA', letterSpacing: '-0.5px' }}>HFA</span>
              <span style={{ fontSize: '12px', color: '#64748B', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>SERA Analysis</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
              <a
                href="#metodologia"
                onClick={e => { e.preventDefault(); document.getElementById('metodologia')?.scrollIntoView({ behavior: 'smooth' }) }}
                style={{ fontSize: '14px', color: '#94A3B8', textDecoration: 'none', fontWeight: 400 }}
              >
                Metodologia
              </a>
              <a
                href="#validacao"
                onClick={e => { e.preventDefault(); document.getElementById('validacao')?.scrollIntoView({ behavior: 'smooth' }) }}
                style={{ fontSize: '14px', color: '#94A3B8', textDecoration: 'none', fontWeight: 400 }}
              >
                Validação
              </a>
              <a
                href="#referencias"
                onClick={e => { e.preventDefault(); document.getElementById('referencias')?.scrollIntoView({ behavior: 'smooth' }) }}
                style={{ fontSize: '14px', color: '#94A3B8', textDecoration: 'none', fontWeight: 400 }}
              >
                Referências
              </a>
              <Link href="/login" style={{ fontSize: '14px', color: '#94A3B8', textDecoration: 'none', fontWeight: 400 }}>Entrar</Link>
              <Link href="/register" style={{ backgroundColor: '#2563EB', color: '#fff', padding: '8px 18px', borderRadius: '8px', fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}>
                Testar com uma ocorrência real
              </Link>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <section style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 32px',
          backgroundColor: '#060B14',
          backgroundImage: `linear-gradient(rgba(59,130,246,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.03) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
          textAlign: 'center',
        }}>
          <div style={{ maxWidth: '920px' }}>
            <div className="animate-fade-up delay-1" style={{
              display: 'inline-block',
              backgroundColor: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.25)',
              borderRadius: '999px',
              padding: '5px 16px',
              fontSize: '13px',
              color: '#93C5FD',
              marginBottom: '28px',
              letterSpacing: '0.02em',
            }}>
              Investigação operacional baseada em SERA
            </div>

            <h1 className="animate-fade-up delay-2" style={{ fontFamily: "'DM Serif Display', serif", fontSize: '64px', lineHeight: 1.12, margin: '0 0 24px', fontWeight: 400 }}>
              Sua investigação encontrou a causa certa?<br />
              <span style={{ color: '#60A5FA' }}>Compare com uma análise HFA.</span>
            </h1>

            <p className="animate-fade-up delay-3" style={{ fontSize: '20px', color: '#94A3B8', lineHeight: 1.65, marginBottom: '40px', maxWidth: '660px', margin: '0 auto 40px' }}>
              Escolha uma ocorrência que sua empresa já investigou. O HFA analisa as mesmas evidências com metodologia estruturada, rastreabilidade e revisão humana. Compare os resultados antes de decidir se vale a pena contratar.
            </p>

            <div className="animate-fade-up delay-3" style={{
              maxWidth: '900px',
              margin: '-22px auto 34px',
              border: '1px solid rgba(96,165,250,0.18)',
              background: 'linear-gradient(90deg, rgba(15,23,42,0.78), rgba(37,99,235,0.10), rgba(15,23,42,0.78))',
              borderRadius: '14px',
              padding: '18px',
              boxShadow: '0 0 36px rgba(37,99,235,0.08)',
            }}>
              <div style={{ fontSize: '11px', color: '#60A5FA', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '14px' }}>
                Linha metodológica
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 32px 1fr 32px 1fr', gap: '0', alignItems: 'stretch', textAlign: 'left' }}>
                {[
                  {
                    title: 'K.C. Hendy',
                    meta: 'DRDC Canada · SERA',
                    desc: 'Base metodológica para investigar erro humano por processamento de informação, percepção, objetivo e ação.',
                  },
                  {
                    title: 'F.P. Daumas',
                    meta: 'Mestrado · MDC + SERA',
                    desc: 'Expansão aplicada à aviação offshore, com foco em cognição operacional e investigação de fatores humanos.',
                  },
                  {
                    title: 'HFA/SERA',
                    meta: 'Arquitetura auditável',
                    desc: 'Implementação moderna com IA assistida, gates metodológicos, regras formais e validação determinística.',
                  },
                ].map((item, i) => (
                  <div key={item.title} style={{ display: 'contents' }}>
                    <div style={{ backgroundColor: 'rgba(8,16,30,0.62)', border: '1px solid rgba(96,165,250,0.14)', borderRadius: '10px', padding: '16px' }}>
                      <h3 style={{ fontSize: '15px', color: '#F8FAFC', margin: '0 0 5px', fontWeight: 700 }}>{item.title}</h3>
                      <p style={{ fontSize: '12px', color: '#60A5FA', margin: '0 0 8px', lineHeight: 1.45 }}>{item.meta}</p>
                      <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0, lineHeight: 1.6 }}>{item.desc}</p>
                    </div>
                    {i < 2 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60A5FA', fontSize: '18px' }}>
                        →
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="animate-fade-up delay-4" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '12px',
              margin: '0 auto 34px',
              maxWidth: '860px',
            }}>
              {[
                { code: 'P', title: 'Percepção', desc: 'O que o operador percebeu, deixou de perceber ou interpretou.' },
                { code: 'O', title: 'Objetivo', desc: 'O que o operador tentava alcançar naquele contexto operacional.' },
                { code: 'A', title: 'Ação', desc: 'Como o operador executou, omitiu, selecionou ou confirmou a ação.' },
              ].map((item) => (
                <div key={item.code} className="logic-card" style={{ borderRadius: '12px', padding: '18px 16px', textAlign: 'left' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: '13px', color: '#60A5FA', marginBottom: '10px' }}>{item.code}</div>
                  <div style={{ fontSize: '15px', color: '#F8FAFC', fontWeight: 600, marginBottom: '6px' }}>{item.title}</div>
                  <div style={{ fontSize: '13px', color: '#94A3B8', lineHeight: 1.6 }}>{item.desc}</div>
                </div>
              ))}
            </div>

            <div className="animate-fade-up delay-3" style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '34px' }}>
              {['Metodologia em validação técnica', 'Piloto de 60 dias · sem cartão', 'Arquitetura determinística', 'Base metodológica', 'DRDC Canada'].map((badge) => (
                <span key={badge} style={{
                  border: '1px solid rgba(96,165,250,0.22)',
                  backgroundColor: 'rgba(15,23,42,0.52)',
                  color: '#BFDBFE',
                  borderRadius: '999px',
                  padding: '7px 13px',
                  fontSize: '12px',
                  letterSpacing: '0.03em',
                }}>
                  {badge}
                </span>
              ))}
            </div>

            <div className="animate-fade-up delay-4" style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginBottom: '56px', flexWrap: 'wrap' }}>
              <Link
                href="/register"
                style={{
                backgroundColor: '#2563EB',
                color: '#fff',
                padding: '14px 28px',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: 500,
                border: '1px solid rgba(147,197,253,0.18)',
                textDecoration: 'none',
              }}>
                Testar com uma ocorrência real
              </Link>
              <button
                onClick={() => document.getElementById('metodologia')?.scrollIntoView({ behavior: 'smooth' })}
                style={{
                  backgroundColor: 'transparent',
                  color: '#CBD5E1',
                  border: '1px solid #334155',
                  padding: '14px 28px',
                  borderRadius: '10px',
                  fontSize: '16px',
                  fontWeight: 400,
                  cursor: 'pointer',
                }}
              >
                Ver metodologia
              </button>
            </div>

            <div className="animate-fade-up delay-5" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0', borderTop: '1px solid rgba(148,163,184,0.1)', paddingTop: '40px' }}>
              {[
                { value: '70–80%', label: 'dos acidentes possuem fatores humanos identificáveis' },
                { value: '7 etapas', label: 'metodológicas auditáveis' },
                { value: '3 níveis', label: 'Percepção · Objetivo · Ação' },
                { value: 'Validação', label: 'lógica cruzada' },
              ].map((m, i) => (
                <div key={i} style={{ padding: '0 18px', borderLeft: i > 0 ? '1px solid rgba(148,163,184,0.12)' : 'none', textAlign: 'center' }}>
                  <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: '28px', color: '#60A5FA', marginBottom: '6px' }}>{m.value}</div>
                  <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SEÇÃO 2 — COMO FUNCIONA */}
        <section style={{ backgroundColor: '#0A1628', padding: '88px 32px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.15fr', gap: '46px', alignItems: 'start', marginBottom: '36px' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#3B82F6', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '16px' }}>
                  O que é a ferramenta
                </div>
                <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '40px', lineHeight: 1.18, fontWeight: 400, color: '#F1F5F9', margin: '0 0 18px' }}>
                  Do relato bruto ao perfil de risco da organização.
                </h2>
                <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.8, margin: 0, textAlign: 'justify' }}>
                  O HFA/SERA é uma plataforma especializada para apoiar análises de fatores humanos. Você envia os dados brutos do evento,
                  em PDF ou colando o texto disponível, e o sistema aplica a metodologia passo a passo para transformar informação dispersa
                  em uma análise estruturada, rastreável e útil para gestão de segurança.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                {[
                  {
                    icon: UploadCloud,
                    title: '1. Envio do evento',
                    desc: 'Cole o relato ou envie um PDF com qualquer informação disponível: relatório, narrativa, evidências, histórico ou observações.',
                  },
                  {
                    icon: FileText,
                    title: '2. Extração inicial',
                    desc: 'O sistema organiza o texto, identifica o ponto de fuga do evento e separa o que é evidência do que é interpretação.',
                  },
                  {
                    icon: GitBranch,
                    title: '3. Aplicação SERA',
                    desc: 'A análise segue os passos metodológicos: percepção, objetivo, ação, pré-condições, recuperação do erro e validação lógica.',
                  },
                  {
                    icon: ClipboardCheck,
                    title: '4. Entrega auditável',
                    desc: 'Ao final, você recebe códigos P/O/A, justificativas, hipóteses descartadas, recomendações e relatório defensável.',
                  },
                ].map((item) => {
                  const Icon = item.icon

                  return (
                    <div key={item.title} className="logic-card" style={{ borderRadius: '12px', padding: '20px 18px' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '10px', border: '1px solid rgba(96,165,250,0.18)', backgroundColor: 'rgba(37,99,235,0.10)', color: '#60A5FA', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
                        <Icon size={22} strokeWidth={1.8} />
                      </div>
                      <h3 style={{ fontSize: '15px', color: '#F8FAFC', margin: '0 0 8px', fontWeight: 600 }}>{item.title}</h3>
                      <p style={{ fontSize: '13px', color: '#94A3B8', lineHeight: 1.65, margin: 0 }}>{item.desc}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ backgroundColor: '#0D1A2D', border: '1px solid rgba(96,165,250,0.16)', borderRadius: '14px', padding: '24px', display: 'grid', gridTemplateColumns: '0.65fr 1.35fr', gap: '26px', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '12px', border: '1px solid rgba(96,165,250,0.22)', backgroundColor: 'rgba(37,99,235,0.12)', color: '#60A5FA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BarChart3 size={25} strokeWidth={1.8} />
                </div>
                <div>
                  <h3 style={{ fontSize: '17px', color: '#F8FAFC', margin: '0 0 6px', fontWeight: 600 }}>Depois de vários relatórios</h3>
                  <p style={{ fontSize: '13px', color: '#60A5FA', margin: 0 }}>Dashboard · perfil de risco · tendências</p>
                </div>
              </div>
              <p style={{ fontSize: '15px', color: '#CBD5E1', lineHeight: 1.75, margin: 0, textAlign: 'justify' }}>
                Conforme a empresa analisa novos eventos, o HFA/SERA consolida padrões recorrentes: tipos de falha humana, pré-condições,
                áreas mais expostas, barreiras frágeis e tendências por período. Isso transforma relatórios isolados em inteligência para
                investigação, treinamento, priorização de ações corretivas e gerenciamento de risco.
              </p>
            </div>
          </div>
        </section>

        {/* SEÇÃO 3 — O PROBLEMA */}
        <section id="metodologia" style={{ backgroundColor: '#0A1628', padding: '96px 32px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '72px', alignItems: 'start' }}>
            {/* Coluna esquerda */}
            <div>
              <div style={{ fontSize: '11px', color: '#3B82F6', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '16px' }}>O PROBLEMA</div>
              <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '40px', lineHeight: 1.2, fontWeight: 400, margin: '0 0 24px', color: '#F1F5F9' }}>
                Metodologias interpretativas nem sempre são repetíveis.
              </h2>
              <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.8, marginBottom: '16px' }}>
                Investigações de fatores humanos precisam separar evidência, mecanismo causal e consequência operacional. Quando a classificação
                depende exclusivamente da interpretação do avaliador, surgem inconsistência entre investigadores, baixa repetibilidade e dificuldade
                de auditoria.
              </p>
              <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.8, marginBottom: '32px' }}>
                O HFA/SERA preserva a pergunta metodológica central: o desvio nasceu de percepção, objetivo ou ação? Essa separação impede
                classificações genéricas e reduz a mistura entre o que o operador percebeu, pretendia e executou.
              </p>
              <blockquote style={{ borderLeft: '3px solid #3B82F6', paddingLeft: '20px', margin: 0 }}>
                <p style={{ fontSize: '15px', color: '#CBD5E1', fontStyle: 'italic', lineHeight: 1.7, marginBottom: '10px' }}>
                  &ldquo;Labeling an event as &apos;human error&apos; provides no useful information about why the error occurred
                  or how to prevent it from occurring again.&rdquo;
                </p>
                <cite style={{ fontSize: '13px', color: '#64748B', fontStyle: 'normal' }}>— K.C. Hendy, SERA (2003)</cite>
              </blockquote>
            </div>

            {/* Coluna direita */}
            <div style={{ backgroundColor: '#0D1A2D', border: '1px solid rgba(148,163,184,0.1)', borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(148,163,184,0.1)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                <span style={{ fontSize: '12px', color: '#64748B', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Comparação técnica, sem oposição metodológica</span>
              </div>
              <div style={{ padding: '22px 24px', borderBottom: '1px solid rgba(148,163,184,0.07)' }}>
                <p style={{ fontSize: '15px', color: '#CBD5E1', lineHeight: 1.7, margin: 0 }}>
                  O HFA/SERA não substitui o HFACS. As metodologias possuem focos diferentes e podem atuar de forma complementar:
                  HFACS organiza camadas do sistema; SERA detalha o mecanismo cognitivo-operacional do evento.
                </p>
              </div>
              <div className="comparison-row" style={{ padding: '24px', borderBottom: '1px solid rgba(148,163,184,0.07)', transition: 'background 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#94A3B8', display: 'inline-block' }} />
                  <span style={{ fontSize: '13px', color: '#CBD5E1', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>HFACS tradicional</span>
                </div>
                {['camadas organizacionais e supervisão', 'contexto institucional do evento', 'útil para mapear onde a falha apareceu', 'interpretação dependente do avaliador'].map((item) => (
                  <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '8px' }}>
                    <span style={{ color: '#475569', marginTop: '2px' }}>—</span>
                    <span style={{ fontSize: '14px', color: '#94A3B8' }}>{item}</span>
                  </div>
                ))}
              </div>
              <div className="comparison-row" style={{ padding: '24px', transition: 'background 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#60A5FA', boxShadow: '0 0 16px rgba(96,165,250,0.45)', display: 'inline-block' }} />
                  <span style={{ fontSize: '13px', color: '#93C5FD', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>HFA/SERA</span>
                </div>
                {['mecanismo cognitivo-operacional', 'separação entre percepção, objetivo e ação', 'estrutura causal verificável', 'validação determinística e rastreável'].map((item) => (
                  <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '8px' }}>
                    <span style={{ color: '#3B82F6', marginTop: '2px' }}>→</span>
                    <span style={{ fontSize: '14px', color: '#CBD5E1' }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* SEÇÃO 4 — COMO A LÓGICA DECIDE */}
        <section style={{ backgroundColor: '#060B14', padding: '88px 32px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '0.95fr 1.05fr', gap: '44px', alignItems: 'start' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#3B82F6', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '16px' }}>COMO O SISTEMA PENSA</div>
                <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '40px', lineHeight: 1.2, fontWeight: 400, margin: '0 0 22px', color: '#F1F5F9' }}>
                  A lógica funciona como uma investigação guiada.
                </h2>
                <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.8, margin: 0 }}>
                  Em vez de procurar um código parecido com o texto, o HFA/SERA conduz perguntas locais em sequência. Cada resposta elimina
                  hipóteses incompatíveis e mantém a análise presa ao mecanismo causal predominante.
                </p>
              </div>

              <div style={{ display: 'grid', gap: '12px' }}>
                {[
                  { step: '01', title: 'A percepção estava correta?', desc: 'Se o texto não mostra falha perceptiva explícita, o sistema não força uma explicação de percepção.' },
                  { step: '02', title: 'Qual era o objetivo operacional?', desc: 'O sistema separa objetivo correto, atalho normalizado, proteção de pessoa e busca por eficiência.' },
                  { step: '03', title: 'A execução falhou por qual motivo?', desc: 'Incapacidade física, falta de treinamento, comunicação e seleção errada são avaliadas antes de omissões genéricas.' },
                  { step: '04', title: 'A hipótese é coerente?', desc: 'Antes da revisão humana, o sistema verifica se percepção, objetivo e ação não se contradizem.' },
                ].map((item) => (
                  <div key={item.step} className="logic-card" style={{ borderRadius: '12px', padding: '18px 20px', display: 'grid', gridTemplateColumns: '44px 1fr', gap: '14px' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#60A5FA' }}>{item.step}</div>
                    <div>
                      <h3 style={{ fontSize: '16px', color: '#F8FAFC', margin: '0 0 6px', fontWeight: 600 }}>{item.title}</h3>
                      <p style={{ fontSize: '14px', color: '#94A3B8', lineHeight: 1.65, margin: 0 }}>{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* SEÇÃO 4 — PIPELINE SERA */}
        <section style={{ backgroundColor: '#060B14', padding: '96px 32px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '64px' }}>
              <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '40px', fontWeight: 400, color: '#F1F5F9', margin: '0 0 16px' }}>
                Pipeline metodológico
              </h2>
              <p style={{ fontSize: '17px', color: '#64748B', maxWidth: '560px', margin: '0 auto' }}>
                Relatório → Extração → Percepção → Objetivo → Ação → Validação → Análise final.
              </p>
            </div>

            {/* Pipeline cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) 20px minmax(0,1fr) 20px minmax(0,1.4fr) 20px minmax(0,1fr) 20px minmax(0,1fr)',
              gap: '0',
              alignItems: 'center',
            }}>

              {/* Etapa 1 */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px',
                padding: '20px 16px',
              }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#3B82F6', letterSpacing: '0.05em' }}>Entrada</span>
                <p style={{ fontSize: '15px', fontWeight: 600, color: '#fff', margin: '6px 0 4px' }}>Relatório</p>
                <p style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.5, margin: 0 }}>Evidência textual operacional</p>
              </div>

              {/* Conector */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <span style={{ color: '#334155', fontSize: '18px' }}>→</span>
              </div>

              {/* Etapa 2 */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px',
                padding: '20px 16px',
              }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#3B82F6', letterSpacing: '0.05em' }}>Etapa 1–2</span>
                <p style={{ fontSize: '15px', fontWeight: 600, color: '#fff', margin: '6px 0 4px' }}>Extração</p>
                <p style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.5, margin: 0 }}>Resumo e ponto de fuga</p>
              </div>

              {/* Conector */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <span style={{ color: '#334155', fontSize: '18px' }}>→</span>
              </div>

              {/* Grupo paralelo 3/4/5 */}
              <div style={{
                border: '1px solid rgba(59,130,246,0.25)',
                borderRadius: '14px',
                padding: '12px',
                background: 'rgba(59,130,246,0.04)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}>
                <span style={{
                  fontSize: '10px', fontWeight: 700, color: '#3B82F6',
                  letterSpacing: '0.12em', textAlign: 'center',
                  textTransform: 'uppercase', marginBottom: '2px',
                }}>Paralelo</span>

                {[
                  { n: '3', title: 'Percepção', desc: 'O que o operador acreditava' },
                  { n: '4', title: 'Objetivo', desc: 'O que tentava alcançar' },
                  { n: '5', title: 'Ação', desc: 'Como tentou executar' },
                ].map((e) => (
                  <div key={e.n} style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(59,130,246,0.15)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                  }}>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: '#3B82F6' }}>Etapa {e.n}</span>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#fff', margin: '3px 0 2px' }}>{e.title}</p>
                    <p style={{ fontSize: '11px', color: '#64748B', margin: 0 }}>{e.desc}</p>
                  </div>
                ))}
              </div>

              {/* Conector */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <span style={{ color: '#334155', fontSize: '18px' }}>→</span>
              </div>

              {/* Etapa 6 */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px',
                padding: '20px 16px',
              }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#3B82F6', letterSpacing: '0.05em' }}>Etapa 6</span>
                <p style={{ fontSize: '15px', fontWeight: 600, color: '#fff', margin: '6px 0 4px' }}>Validação</p>
                <p style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.5, margin: 0 }}>Coerência lógica cruzada</p>
              </div>

              {/* Conector */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <span style={{ color: '#334155', fontSize: '18px' }}>→</span>
              </div>

              {/* Etapa 7 */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px',
                padding: '20px 16px',
              }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#3B82F6', letterSpacing: '0.05em' }}>Etapa 7</span>
                <p style={{ fontSize: '15px', fontWeight: 600, color: '#fff', margin: '6px 0 4px' }}>Análise final</p>
                <p style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.5, margin: 0 }}>Conclusões e recomendações</p>
              </div>

            </div>

            <div style={{ marginTop: '34px', backgroundColor: '#0A1628', border: '1px solid rgba(96,165,250,0.14)', borderRadius: '14px', padding: '24px' }}>
              <h3 style={{ fontSize: '17px', color: '#F8FAFC', margin: '0 0 16px', fontWeight: 600 }}>O que cada etapa procura responder</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                {[
                  { title: '1. O que aconteceu?', desc: 'Organiza o relato bruto, preservando evidências e contexto operacional.' },
                  { title: '2. Onde a segurança foi perdida?', desc: 'Identifica o ponto de fuga: o momento em que o controle deixou de ser adequado.' },
                  { title: '3. O operador percebeu corretamente?', desc: 'Separa falhas de percepção, atenção, interpretação e comunicação.' },
                  { title: '4. Qual era o objetivo?', desc: 'Distingue tarefa correta, atalho, eficiência, violação normalizada ou intenção protetiva.' },
                  { title: '5. Como a ação falhou?', desc: 'Classifica omissão, verificação, incapacidade física, treinamento, seleção, supervisão ou comunicação.' },
                  { title: '6. Quais condições favoreceram?', desc: 'Levanta pré-condições ligadas a pessoa, supervisão, tarefa, trabalho e organização.' },
                  { title: '7. O erro era recuperável?', desc: 'Avalia detectabilidade, reversibilidade e barreiras disponíveis antes das consequências.' },
                  { title: '8. O que fazer com isso?', desc: 'Gera hipóteses estruturadas, recomendações candidatas e dados para consolidação descritiva da organização.' },
                ].map((item) => (
                  <div key={item.title} style={{ backgroundColor: '#0D1A2D', border: '1px solid rgba(148,163,184,0.1)', borderRadius: '10px', padding: '16px 14px' }}>
                    <h4 style={{ fontSize: '13px', color: '#F8FAFC', margin: '0 0 7px', fontWeight: 600 }}>{item.title}</h4>
                    <p style={{ fontSize: '12px', color: '#94A3B8', lineHeight: 1.55, margin: 0 }}>{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <p style={{ textAlign: 'center', fontSize: '14px', color: '#475569', marginTop: '36px' }}>
              As decisões são restringidas por gates formais, códigos permitidos por branch e validação cruzada entre categorias.
            </p>
          </div>
        </section>

        {/* SEÇÃO 5 — BASE METODOLÓGICA */}
        <section id="sobre-sera" style={{ backgroundColor: '#0A1628', padding: '96px 32px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ marginBottom: '56px' }}>
              <div style={{ fontSize: '11px', color: '#3B82F6', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '16px' }}>FUNDAMENTAÇÃO CIENTÍFICA</div>
              <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '40px', fontWeight: 400, color: '#F1F5F9', margin: 0, maxWidth: '640px' }}>
                Uma metodologia de investigação, não uma promessa de automação.
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '28px' }}>
              <div className="research-panel" style={{ borderRadius: '16px', padding: '34px 30px' }}>
                <div style={{ fontSize: '11px', color: '#93C5FD', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '14px' }}>Painel 1</div>
                <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '28px', color: '#F8FAFC', fontWeight: 400, margin: '0 0 18px' }}>
                  K.C. Hendy — Defence Research and Development Canada
                </h3>
                <p style={{ fontSize: '15px', color: '#CBD5E1', lineHeight: 1.8 }}>
                  A metodologia SERA foi originalmente desenvolvida por K.C. Hendy no Defence Research and Development Canada (DRDC),
                  com foco em investigação de fatores humanos, processamento cognitivo, percepção operacional e análise sistemática do erro humano.
                </p>
                <p style={{ fontSize: '14px', color: '#94A3B8', lineHeight: 1.75 }}>
                  Sua base combina modelo de processamento de informação, pressão temporal, feedback cognitivo, separação entre percepção,
                  decisão e ação, e causalidade operacional.
                </p>
                <div className="paper-ref" style={{ borderRadius: '8px', padding: '16px 18px', marginTop: '22px' }}>
                  <p style={{ fontSize: '13px', color: '#BFDBFE', lineHeight: 1.7, margin: 0 }}>
                    Hendy, K.C. (2003). <em>A Tool for Human Factors Accident Investigation, Classification and Risk Management.</em><br />
                    Defence Research and Development Canada (DRDC Toronto TR 2002-057).
                  </p>
                </div>
              </div>

              <div className="research-panel" style={{ borderRadius: '16px', padding: '34px 30px' }}>
                <div style={{ fontSize: '11px', color: '#93C5FD', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '14px' }}>Painel 2</div>
                <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '28px', color: '#F8FAFC', fontWeight: 400, margin: '0 0 18px' }}>
                  F.P. Daumas — da pesquisa operacional à arquitetura HFA/SERA
                </h3>
                <p style={{ fontSize: '15px', color: '#CBD5E1', lineHeight: 1.75, margin: '0 0 18px' }}>
                  F.P. Daumas levou a base SERA para o contexto da aviação offshore e, depois, para uma arquitetura computacional auditável.
                  Sua contribuição central foi transformar a análise em um fluxo controlado por regras.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '18px' }}>
                  {[
                    'Piloto de Helicóptero Offshore',
                    'Psicólogo',
                    'Mestre em Engenharia de Produção e Sistemas Computacionais',
                    'Facilitador de CRM',
                    'Instrutor de aeronaves',
                    'Elemento Credenciado em Fator Humano pelo CENIPA',
                  ].map((item) => (
                    <div key={item} style={{ border: '1px solid rgba(96,165,250,0.14)', backgroundColor: 'rgba(15,23,42,0.38)', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#CBD5E1', lineHeight: 1.45 }}>
                      {item}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {[
                    'Aplicou SERA em pesquisa sobre incidentes da aviação offshore.',
                    'Combinou SERA com o Método da Decisão Crítica para recuperar raciocínio operacional.',
                    'Formalizou a separação entre percepção, objetivo e ação em regras verificáveis.',
                    'Projetou o HFA/SERA para usar IA como apoio interpretativo, não como classificador livre.',
                  ].map((item) => (
                    <div key={item} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '13px', color: '#94A3B8', lineHeight: 1.6 }}>
                      <span style={{ color: '#60A5FA' }}>→</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <a href="https://www.linkedin.com/in/filipedaumas/?locale=pt" target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '18px', color: '#93C5FD', fontSize: '14px', textDecoration: 'none' }}>
                  Perfil profissional →
                </a>
              </div>
            </div>

            <div style={{
              backgroundColor: '#0D1A2D',
              border: '1px solid rgba(96,165,250,0.16)',
              borderRadius: '16px',
              padding: '28px',
              marginBottom: '28px',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr', gap: '28px', alignItems: 'start', marginBottom: '22px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#3B82F6', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '10px' }}>
                    Da pesquisa ao sistema
                  </div>
                  <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '30px', lineHeight: 1.2, color: '#F8FAFC', fontWeight: 400, margin: 0 }}>
                    Como a metodologia virou arquitetura auditável.
                  </h3>
                </div>
                <p style={{ fontSize: '15px', color: '#94A3B8', lineHeight: 1.75, margin: 0 }}>
                  A pesquisa de F.P. Daumas não começou como produto de IA. Ela começou como investigação operacional: entender como pilotos experientes
                  percebem, decidem e agem em cenários críticos. A IA só passou a ser viável quando os modelos ficaram capazes de apoiar leitura
                  profunda sem substituir os controles metodológicos.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                {[
                  {
                    step: '01',
                    title: 'Origem',
                    desc: 'O interesse em percepção, decisão, erro humano e pressão operacional levou F.P. Daumas à Psicologia e aos fatores humanos.',
                  },
                  {
                    step: '02',
                    title: 'Mestrado',
                    desc: 'Em 2018, sua dissertação combinou SERA e Método da Decisão Crítica para investigar incidentes na aviação offshore.',
                  },
                  {
                    step: '03',
                    title: 'Limite tecnológico',
                    desc: 'Na época, a IA ainda não sustentava relatos longos, coerência causal e separação confiável entre percepção, objetivo e ação.',
                  },
                  {
                    step: '04',
                    title: 'HFA/SERA',
                    desc: 'A versão moderna usa IA assistida dentro de gates, regras formais, rastreabilidade textual e validação determinística.',
                  },
                ].map((item) => (
                  <div key={item.step} style={{ backgroundColor: '#0A1628', border: '1px solid rgba(148,163,184,0.1)', borderRadius: '10px', padding: '18px 16px' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#60A5FA', marginBottom: '12px' }}>{item.step}</div>
                    <h4 style={{ fontSize: '15px', color: '#F8FAFC', margin: '0 0 8px', fontWeight: 600 }}>{item.title}</h4>
                    <p style={{ fontSize: '13px', color: '#94A3B8', lineHeight: 1.6, margin: 0 }}>{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }}>
              {[
                { title: 'Processamento da Informação', desc: 'A pressão operacional emerge da relação entre informação a processar e tempo disponível.', mono: 'Pressão de Tempo = Informação / Tempo' },
                { title: 'Controle Perceptual', desc: 'Operadores agem sobre o que acreditam perceber, não sobre uma fotografia objetiva do mundo.', mono: 'Objetivo → Percepção → Comparação → Ação' },
                { title: 'Integração com HFACS', desc: 'HFACS organiza níveis organizacionais; SERA detalha o mecanismo cognitivo e operacional do ato inseguro.', mono: 'Onde ocorreu + por que ocorreu' },
              ].map((item) => (
                <div key={item.title} style={{ backgroundColor: '#0D1A2D', border: '1px solid rgba(148,163,184,0.1)', borderRadius: '12px', padding: '24px 22px' }}>
                  <h3 style={{ fontSize: '16px', color: '#F1F5F9', margin: '0 0 10px', fontWeight: 600 }}>{item.title}</h3>
                  <p style={{ fontSize: '14px', color: '#94A3B8', lineHeight: 1.7, margin: '0 0 16px' }}>{item.desc}</p>
                  <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.16)', backgroundColor: 'rgba(59,130,246,0.06)', borderRadius: '8px', padding: '10px 12px' }}>
                    {item.mono}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SEÇÃO 6 — CONFIABILIDADE */}
        <section style={{ backgroundColor: '#060B14', padding: '96px 32px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '56px' }}>
              <div style={{ fontSize: '11px', color: '#3B82F6', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '16px' }}>POR QUE O SISTEMA É CONFIÁVEL</div>
              <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '40px', fontWeight: 400, color: '#F1F5F9', margin: 0 }}>
                Por que a lógica é confiável?
              </h2>
              <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.75, maxWidth: '720px', margin: '18px auto 0' }}>
                Porque o sistema separa interpretação textual de decisão metodológica. A IA ajuda a ler o relato, mas a conclusão passa por
                regras fixas, evidência verificável, prioridades entre mecanismos e checagens de contradição.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '18px' }}>
              {[
                { title: 'Separação cognitiva explícita', desc: 'Percepção, objetivo e ação são avaliados como mecanismos diferentes, evitando misturar intenção, execução e consequência.' },
                { title: 'Estrutura determinística', desc: 'Cada etapa restringe os códigos possíveis por regras formais, precedência metodológica e branches permitidos.' },
                { title: 'Evidência rastreável', desc: 'A decisão precisa estar ligada a sinais textuais do relato, permitindo auditoria posterior por outro investigador.' },
                { title: 'Validação cruzada', desc: 'O resultado final é checado contra as etapas anteriores para bloquear combinações logicamente incompatíveis.' },
              ].map((pillar, i) => (
                <div key={pillar.title} style={{
                  backgroundColor: '#0A1628',
                  border: '1px solid rgba(96,165,250,0.14)',
                  borderRadius: '12px',
                  padding: '26px 22px',
                  minHeight: '190px',
                }}>
                  <div style={{ fontFamily: 'monospace', color: '#60A5FA', fontSize: '12px', marginBottom: '20px' }}>0{i + 1}</div>
                  <h3 style={{ fontSize: '16px', color: '#F8FAFC', lineHeight: 1.35, margin: '0 0 12px', fontWeight: 600 }}>{pillar.title}</h3>
                  <p style={{ fontSize: '14px', color: '#94A3B8', lineHeight: 1.7, margin: 0 }}>{pillar.desc}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '28px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
              {[
                {
                  title: 'Incapacidade física não é omissão simples',
                  desc: 'Se o relato mostra limitação de força, alcance, ergonomia, EPI ou equipamento, o sistema classifica como A-D antes de considerar A-B.',
                  rule: 'A-D vence A-B',
                },
                {
                  title: 'Comunicação não é checklist incompleto',
                  desc: 'Quando a falha central envolve readback, confirmação, recepção ou coordenação verbal, o mecanismo é comunicação operacional.',
                  rule: 'A-J vence A-B/A-C',
                },
                {
                  title: 'Violação excepcional não exige proteção humana',
                  desc: 'O-C é desvio consciente, pontual e não rotineiro de regra ou procedimento. A motivação pode ser conveniência, improviso, pressão situacional ou proteção humana — qualquer razão circunstancial serve. O que define O-C é o desvio consciente e excepcional.',
                  rule: 'O-C: desvio consciente excepcional — motivo é evidência, não requisito',
                },
              ].map((item) => (
                <div key={item.title} style={{ border: '1px solid rgba(96,165,250,0.16)', backgroundColor: '#0A1628', borderRadius: '10px', padding: '18px 18px' }}>
                  <h3 style={{ fontSize: '14px', color: '#F8FAFC', lineHeight: 1.4, margin: '0 0 8px', fontWeight: 600 }}>{item.title}</h3>
                  <p style={{ fontSize: '13px', color: '#94A3B8', lineHeight: 1.65, margin: '0 0 12px', textAlign: 'justify' }}>{item.desc}</p>
                  <p style={{ fontFamily: 'monospace', fontSize: '12px', color: '#93C5FD', margin: 0 }}>{item.rule}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SEÇÃO 6 — FUNCIONALIDADES */}
        <section style={{ backgroundColor: '#060B14', padding: '96px 32px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '40px', fontWeight: 400, color: '#F1F5F9', textAlign: 'center', margin: '0 0 56px' }}>
              Instrumentação para análise operacional
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
              {[
                {
                  title: 'Pipeline SERA auditável',
                  desc: 'Relatórios operacionais são convertidos em etapas metodológicas documentadas, com decisões e descartes explícitos.',
                  icon: 'P1',
                },
                {
                  title: 'Classificação P · O · A',
                  desc: 'Percepção, objetivo e ação são tratados como dimensões distintas do mecanismo causal predominante.',
                  icon: 'P/O/A',
                },
                {
                  title: 'Perfil de Risco Organizacional',
                  desc: 'Agrupamento de padrões de falha, pré-condições recorrentes e tendências úteis para gestão de segurança operacional.',
                  icon: 'RISK',
                },
                {
                  title: 'Matriz ISO + ARMS-ERC',
                  desc: 'Apoio à leitura de severidade, recuperação e risco operacional em estruturas conhecidas pelo setor.',
                  icon: 'ERC',
                },
                {
                  title: 'Compatibilidade com HFACS',
                  desc: 'Permite uso complementar: HFACS para camadas organizacionais e SERA para o mecanismo cognitivo-operacional.',
                  icon: 'HFACS',
                },
                {
                  title: 'Relatórios defensáveis',
                  desc: 'Exportação da análise com justificativas, evidências textuais, códigos descartados e recomendações estruturadas.',
                  icon: 'PDF',
                },
              ].map((f) => (
                <div key={f.title} className="feature-card" style={{
                  backgroundColor: '#0A1628',
                  border: '1px solid rgba(148,163,184,0.1)',
                  borderRadius: '12px',
                  padding: '28px 24px',
                  transition: 'border-color 0.2s',
                }}>
                  <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#60A5FA', marginBottom: '14px', letterSpacing: '0.08em' }}>{f.icon}</div>
                  <h3 style={{ fontSize: '16px', color: '#F1F5F9', fontWeight: 500, marginBottom: '10px' }}>{f.title}</h3>
                  <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SEÇÃO 7 — PARA QUEM É */}
        <section style={{ backgroundColor: '#0A1628', padding: '96px 32px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '40px', fontWeight: 400, color: '#F1F5F9', textAlign: 'center', margin: '0 0 56px' }}>
              Para quem investiga o que realmente importa
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
              {[
                {
                  icon: Plane,
                  sector: 'Aviação',
                  roles: 'Investigadores de ocorrências, pilotos instrutores, responsáveis de segurança de voo.',
                  detail: 'Aviação civil, militar e offshore.',
                },
                {
                  icon: Flame,
                  sector: 'Óleo & Gás',
                  roles: 'Analistas de HSE, investigadores de incidentes offshore, gestores de segurança operacional.',
                  detail: 'Plataformas e bases de apoio.',
                },
                {
                  icon: Factory,
                  sector: 'Indústria & Saúde',
                  roles: 'Engenheiros de segurança, responsáveis por SSMA, investigadores de acidentes industriais e eventos adversos em saúde.',
                  detail: 'Qualquer sistema operacional crítico.',
                },
              ].map((p) => {
                const Icon = p.icon

                return (
                  <div key={p.sector} style={{
                    backgroundColor: '#0D1A2D',
                    border: '1px solid rgba(148,163,184,0.1)',
                    borderRadius: '14px',
                    padding: '34px 28px',
                    minHeight: '260px',
                  }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      border: '1px solid rgba(96,165,250,0.22)',
                      backgroundColor: 'rgba(37,99,235,0.10)',
                      color: '#60A5FA',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '22px',
                      boxShadow: '0 0 24px rgba(37,99,235,0.10)',
                    }}>
                      <Icon size={26} strokeWidth={1.7} />
                    </div>
                    <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '24px', fontWeight: 400, color: '#F1F5F9', marginBottom: '12px' }}>{p.sector}</h3>
                    <p style={{ fontSize: '15px', color: '#94A3B8', lineHeight: 1.7, marginBottom: '10px' }}>{p.roles}</p>
                    <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.55 }}>{p.detail}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* SEÇÃO 8 — VALIDAÇÃO */}
        <section id="validacao" style={{ backgroundColor: '#060B14', padding: '96px 32px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '42px', alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#3B82F6', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '16px' }}>VALIDAÇÃO TÉCNICA E OPERACIONAL</div>
              <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '42px', lineHeight: 1.18, fontWeight: 400, color: '#F1F5F9', margin: '0 0 22px' }}>
                A revisão ocorre antes da conclusão.
              </h2>
              <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.8, marginBottom: '22px' }}>
                O HFA/SERA está em validação técnica e operacional por análises comparativas, cenários operacionais reais e avaliações de consistência.
                O sistema foi projetado para reduzir variabilidade interpretativa, mantendo a decisão final sob revisão humana.
              </p>
              <p style={{ fontSize: '15px', color: '#CBD5E1', lineHeight: 1.75, marginBottom: '22px' }}>
                Na prática, cada etapa produz um resultado e uma lista de hipóteses descartadas. O sistema cruza esses resultados para evitar
                combinações incompatíveis, como tratar uma escolha deliberada de eficiência como objetivo altruístico, ou uma incapacidade física como simples omissão.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {[
                  'repetibilidade analítica',
                  'estabilidade entre execuções',
                  'coerência causal',
                  'redução de ambiguidades',
                  'consistência classificatória',
                  'rastreabilidade textual',
                  'apoio à auditoria',
                ].map((item) => (
                  <div key={item} style={{ border: '1px solid rgba(96,165,250,0.14)', borderRadius: '8px', padding: '12px 14px', color: '#CBD5E1', fontSize: '14px', backgroundColor: '#0A1628' }}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ backgroundColor: '#0D1A2D', border: '1px solid rgba(96,165,250,0.2)', borderRadius: '14px', padding: '30px 28px', boxShadow: '0 0 40px rgba(37,99,235,0.08)' }}>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#60A5FA', letterSpacing: '0.08em', marginBottom: '18px' }}>TECHNICAL CONTROL BOX</div>
              <p style={{ fontSize: '17px', color: '#F8FAFC', lineHeight: 1.65, margin: '0 0 18px' }}>
                O sistema não depende exclusivamente de IA generativa.
              </p>
              <p style={{ fontSize: '14px', color: '#94A3B8', lineHeight: 1.75, margin: 0 }}>
                A IA atua apenas como componente interpretativo dentro de uma arquitetura rigidamente controlada por regras formais,
                branches permitidos, invariantes metodológicos e validações determinísticas.
              </p>
            </div>
          </div>
        </section>

        {/* SEÇÃO 9 — REFERÊNCIAS */}
        <section id="referencias" style={{ backgroundColor: '#0A1628', padding: '96px 32px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ marginBottom: '42px' }}>
              <div style={{ fontSize: '11px', color: '#3B82F6', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '16px' }}>REFERÊNCIAS BIBLIOGRÁFICAS</div>
              <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '40px', fontWeight: 400, color: '#F1F5F9', margin: 0 }}>
                Base bibliográfica da metodologia.
              </h2>
              <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.75, maxWidth: '100%', margin: '18px 0 0', textAlign: 'justify' }}>
                As referências abaixo reúnem a base usada na metodologia SERA de Hendy e no trabalho de F.P. Daumas sobre fatores humanos
                na aviação offshore, incluindo ergonomia cognitiva, HFACS, CRM, análise de decisão, operações offshore e segurança operacional.
              </p>
            </div>

            <div style={{ marginBottom: '34px' }}>
              <h3 style={{ fontSize: '18px', color: '#F8FAFC', margin: '0 0 16px', fontWeight: 600 }}>
                Aplicação prática gratuita do estudo acadêmico
              </h3>
              <p style={{ fontSize: '15px', color: '#94A3B8', lineHeight: 1.75, maxWidth: '100%', margin: '0 0 18px', textAlign: 'justify' }}>
                O HFA/SERA é a aplicação prática dos estudos de mestrado de F.P. Daumas. A ferramenta e a metodologia são disponibilizadas
                gratuitamente com um objetivo direto: melhorar investigações, gerenciamento de risco e segurança operacional em diferentes áreas.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                {relatedWork.map((item) => (
                  <div key={item.title} style={{ backgroundColor: '#0D1A2D', border: '1px solid rgba(96,165,250,0.14)', borderRadius: '12px', padding: '20px 18px' }}>
                    <h4 style={{ fontSize: '15px', color: '#F8FAFC', margin: '0 0 8px', fontWeight: 600 }}>{item.title}</h4>
                    <p style={{ fontSize: '12px', color: '#60A5FA', lineHeight: 1.55, margin: '0 0 10px' }}>{item.meta}</p>
                    <p style={{ fontSize: '13px', color: '#94A3B8', lineHeight: 1.65, margin: 0 }}>{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
              {visibleReferences.map((ref, i) => (
                <div key={ref} className="paper-ref" style={{ borderRadius: '8px', padding: '16px 18px', display: 'grid', gridTemplateColumns: '42px 1fr', gap: '14px', alignItems: 'start' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#60A5FA' }}>{String(i + 1).padStart(2, '0')}</span>
                  <p style={{ fontSize: '14px', color: '#CBD5E1', lineHeight: 1.7, margin: 0 }}>{ref}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowAllReferences(!showAllReferences)}
              style={{
                marginTop: '22px',
                backgroundColor: 'rgba(37,99,235,0.12)',
                border: '1px solid rgba(96,165,250,0.28)',
                borderRadius: '9px',
                color: '#BFDBFE',
                padding: '12px 18px',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              {showAllReferences ? 'Ver menos referências' : `Ver todas as referências (${references.length})`}
            </button>
          </div>
        </section>

        {/* SEÇÃO 8 — CTA */}
        <section style={{
          background: 'linear-gradient(160deg, #0A1628 0%, #0F2040 100%)',
          padding: '96px 32px',
          textAlign: 'center',
        }}>
          <div style={{ maxWidth: '760px', margin: '0 auto' }}>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '48px', fontWeight: 400, color: '#F1F5F9', margin: '0 0 20px', lineHeight: 1.15 }}>
              O objetivo não é substituir o investigador humano.
            </h2>
            <p style={{ fontSize: '17px', color: '#94A3B8', marginBottom: '40px', lineHeight: 1.7 }}>
              O HFA/SERA foi desenvolvido para auxiliar investigadores e organizações a produzir análises
              de fatores humanos mais consistentes, rastreáveis e operacionalmente úteis.
            </p>
            <Link href="/register" style={{
              display: 'inline-block',
              backgroundColor: '#2563EB',
              color: '#fff',
              padding: '16px 36px',
              borderRadius: '10px',
              fontSize: '17px',
              fontWeight: 500,
              textDecoration: 'none',
              marginBottom: '20px',
            }}>
                Iniciar piloto de 60 dias →
            </Link>
            <div style={{ marginBottom: '48px' }}>
              <Link href="/login" style={{ fontSize: '14px', color: '#64748B', textDecoration: 'none' }}>
                Já tem conta? Entrar →
              </Link>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '32px', flexWrap: 'wrap' }}>
              {['rastreabilidade textual', 'metodologia em validação', 'arquitetura determinística'].map((t) => (
                <span key={t} style={{ fontSize: '13px', color: '#475569' }}>{t}</span>
              ))}
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ backgroundColor: '#060B14', borderTop: '1px solid rgba(148,163,184,0.1)', padding: '32px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '24px' }}>
            <div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: '18px', color: '#60A5FA', marginBottom: '8px' }}>HFA Platform</div>
              <p style={{ fontSize: '13px', color: '#475569', maxWidth: '320px', lineHeight: 1.6, margin: 0 }}>
                Baseado na metodologia SERA de K.C. Hendy<br />(Defence R&amp;D Canada, 2003)
              </p>
            </div>
            <div style={{ display: 'flex', gap: '28px', alignItems: 'center' }}>
              <Link href="/login" style={{ fontSize: '13px', color: '#64748B', textDecoration: 'none' }}>Entrar</Link>
              <Link href="/register" style={{ fontSize: '13px', color: '#64748B', textDecoration: 'none' }}>Criar conta</Link>
              <a
                href="#sobre-sera"
                onClick={e => { e.preventDefault(); document.getElementById('sobre-sera')?.scrollIntoView({ behavior: 'smooth' }) }}
                style={{ fontSize: '13px', color: '#64748B', textDecoration: 'none' }}
              >
                Metodologia SERA
              </a>
            </div>
          </div>
        </footer>

      </div>
    </>
  )
}
