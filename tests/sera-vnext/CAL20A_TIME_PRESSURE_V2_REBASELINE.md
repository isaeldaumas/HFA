# CAL-20A — Evidência de pressão de tempo na travessia canônica

## Desvio observado

O relatório da revisão anterior respondeu **Não** ao nó `P_TIME_PRESSURE` apenas porque havia uma referência visual enganosa e não se encontrou pressão temporal explícita. Isto confunde **não documentado** com **documentadamente ausente**.

## Correção do contrato semântico V2

- A resposta **NÃO** requer declaração factual de ausência de pressão excessiva de tempo, anterior ou contemporânea ao ponto de fuga, ou esclarecimento específico e verificável.
- Menção à informação enganosa, monitoramento, distração ou condição ambiental NÃO resolve a pergunta temporal.
- Quando não há prova de presença NEM ausência: `P_TIME_PRESSURE = INSUFFICIENT_EVIDENCE`; a travessia P para e nenhum P-F/P-G/P-H é atribuído como folha sustentada. O relato pode continuar a documentar uma percepção equivocada sem fechar o subtipo final.
- O tratamento é assimétrico: evidência positiva e explícita de pressão excessiva continua elegível ao ramo `SIM`; ausência explicitamente demonstrada continua elegível ao ramo `NÃO`.
- O resultado final continua bloqueado para liberação sem revisão humana.

## Rebaseline intencional, sem invenção de evidências

Os testes semânticos V2 CAL-06, CAL-09 e testes de limite semântico agora aguardam evidência no nó temporal. Suas narrativas e citações foram preservadas; apenas expectativas de código antes alcançadas por inferência foram corrigidas. **Isso não corrige retroativamente PDFs ou decisões históricas.**

Os cenários lexicais legados congelados mantêm as expectativas anteriores como baseline histórico comparável e não representam validação do novo contrato semântico V2. A operacionalização desse contrato para outras gerações do motor exigirá migração e revalidação separadas.

## Discordância humana CAL-21

O teste controlado `cal21-controlled-human-disagreement-trial-001.ts` injeta um candidato errado em memória e confirma revisão humana `RETURN_FOR_REANALYSIS`, autoria, justificativa, versionamento e bloqueio de uma falsa conclusão. Não altera o CAL-21 real e não simula uma correção humana definitiva de código sem evidências.
