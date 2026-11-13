# HFA #122 — Protocolo de avaliação independente do OCR

**Escopo:** medição offline de CER/WER. Não equivale a certificação científica, aprovação institucional nem avaliação causal SERA/P/O/A.

## Pré-requisitos

Cada original exige autorização identificável, transcrição correta revisada por pessoa, saída literal do OCR, versão da ferramenta e hash SHA-256 dos três arquivos. É obrigatório declarar estrato amostral e tipo documental. Não inserir documentos reais nem suas transcrições no GitHub. Manter todos os dados em diretório privado autorizado.

## Manifesto JSON

O campo protocol_version deve ser HFA122-OCR-EVAL-2 e cases deve ter de 1 a 1000 itens. Em cada caso informar id, kind (scanned_pdf/png/jpeg/webp), sampling_stratum, original_path, source_document_sha256, reference_path, reference_sha256, ocr_path, ocr_sha256, consent_authorization_id, ground_truth_verified_by e ocr_engine_version.

Os caminhos são relativos ao diretório privado do manifesto; arquivos faltantes, assinaturas falsas, links simbólicos, travessia de diretório, hash divergente, referência vazia e textos não UTF-8 devem bloquear a avaliação. Limites: original de 30 MB, cada transcrição de 2 MB e manifesto de 2 MB.

## Execução

cd frontend
python3 -B -m unittest discover -s tests -p test_hfa122_ocr_eval.py -v
python3 tools/hfa122_ocr_eval.py /caminho/privado/manifest.json --out /caminho/privado/relatorio.json

Os resultados incluem CER e WER globais e por tipo/estrato. O avaliador calcula distância de Levenshtein estrita e com espaços normalizados. Não copia transcrições para relatórios e não transmite documentos pela rede.

## Governança

Medir também erros críticos de números, datas, matrículas, negações e termos aeronáuticos. Critérios de aceitabilidade devem ser fixados antes de examinar os resultados. Resultados sintéticos não comprovam precisão naturalística. A interpretação temporal/causal deve ser confirmada por investigador humano e não deve ser inferida automaticamente.

**Estado:** implementação do avaliador e testes automatizados não dispensam o corpus real consentido e o ground truth. Até esse corpus existir, qualidade naturalística permanece NOT_RUN.