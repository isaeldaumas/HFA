# HFA Safety Hub v1

**Data:** 2026-10-02
**Status:** implementação inicial

## Decisão de arquitetura

O objeto mestre é o evento. Evento e análise HFA deixam de ser equivalentes.

- Registrar evento de Safety não consome crédito e não executa IA.
- A triagem escolhe monitorar, investigação geral, HFA ou encerramento.
- A primeira análise HFA de um evento consome 1 análise do plano.
- Reanálises do mesmo evento não geram novo débito.
- Falha da análise não invalida o evento e gera estorno quando houve débito.

## Dados adicionados

`events` passa a registrar `event_kind`, `triage_status`, `investigation_path`, `source_system`, `external_reference`, `confidentiality_level`, `reported_at`, `triaged_at` e `triaged_by`.

A tabela `event_documents` preserva anexos de relatos de Safety com isolamento por tenant e RLS.
## API e UX

- `POST /api/events` aceita `analysis_mode=register_only|hfa`.
- `POST /api/events/:id/triage` controla a decisão de Safety.
- `POST /api/analyze` detecta primeira análise de evento existente e aplica débito/estorno.
- `/events/new` oferece registro simples ou registro + HFA.
- `/events/:id` mostra triagem e permite encaminhar para HFA posteriormente.
- `/events` passa a representar gestão de eventos, não apenas histórico de análises.

## Lifecycle e auditoria

Anexos de relatos simples são armazenados no bucket existente e registrados em `event_documents`. O impacto de exclusão inclui esses anexos e o purge remove o objeto de storage antes da exclusão definitiva.

Novos eventos auditáveis: `safety_event_reported` e `safety_event_triaged`.

## Próxima fase

Expandir o tratamento geral do evento: risco, hazard/consequence, ações de Safety independentes de SERA, indicadores e contrato de integração HFA API/AirTrust.
