# Banco ISPC (fuzzy)

Este diretório padroniza os dados que alimentam as **referências** do modelo fuzzy ISPC (normalização min-max, auditorias, correlações e redução de variáveis).

## Objetivo
- Facilitar a atualização anual (novas campanhas/anos) sem perder rastreabilidade.
- Permitir auditoria do modelo (min/max por variável, por profundidade e/ou por ano).
- Apoiar redução de variáveis (ex.: remover variáveis redundantes por alta correlação).

## Esquema recomendado (tabela "registros")
Campos mínimos:
- `ano` (inteiro): ano da campanha/avaliação.
- `profundidade_cm` (texto): ex.: `0-10`, `10-20`.
- `parcela` (texto): sistema de preparo (ex.: CT/MT/NT) ou código experimental.
- `cultura` (texto): ex.: Cowpea / Pearl Millet / Control.

Entradas do ISPC (numéricas):
- `dmg`, `dmp`, `rmp`, `densidade`, `estoque_c`, `na`, `icv`, `altura`, `diam_espiga`, `comp_espiga`,
  `n_plantas`, `n_espigas`, `n_espigas_com`, `peso_espigas`, `produtividade`

## Arquivos gerados
- `ispc_records_*.csv`: registros padronizados (por profundidade/ano).
- `ispc_minmax_*.json`: min/max por variável (para normalização no JS).
- `ispc_correlations_*.csv`: matriz de correlação.
- `ispc_high_corr_pairs_*.csv`: pares com |r| acima de um limiar.
- `ispc_reduction_report_*.md`: sugestão de redução por clusters de correlação.

## Como atualizar com novos anos
1. Copie o template `template_ispc_records.csv`.
2. Acrescente as linhas do novo ano (preenchendo `ano`, `profundidade_cm`, `parcela`, `cultura` e as 15 variáveis).
3. Rode o pipeline em `tools/ispc_pipeline.py` apontando para o CSV mestre.

Exemplos:
- A partir do CSV mestre (recomendado):
    - `python tools/ispc_pipeline.py --csv data/ispc/ispc_records_mestre.csv --out data/ispc`
- A partir do Excel (quando não houver coluna `ano`):
    - `python tools/ispc_pipeline.py --excel caminho/para/banco_dados.xlsx --sheet dados_010 --ano 2024 --out data/ispc`

> Observação: o Excel atual (banco_dados.xlsx) não traz `ano`. Para histórico anual, a recomendação é consolidar em um CSV mestre com coluna `ano`.
