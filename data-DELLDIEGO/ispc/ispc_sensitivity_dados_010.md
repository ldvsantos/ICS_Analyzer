# Analise de sensibilidade - ISPC (dados_010)

- Total de registros: **108**
- Registros validos (comparaveis): **76**
- Entradas no modo reduzido: **10** (estima 5)

## Erro no score (0-10)

- Delta medio (reduzido - completo): 0.125
- MAE: 0.333
- RMSE: 0.631
- Max |delta|: 2.505

## Concordancia de classe

- Concordancia (%): 80.3

## Matriz de confusao (linhas = completo; colunas = reduzido)

| | Baixa | Media | Alta |
|---:|---:|---:|---:|
| Baixa | 0 | 0 | 0 |
| Media | 0 | 54 | 13 |
| Alta | 0 | 2 | 7 |

## Observacoes

- variaveis estimadas por ML (ridge) e inferencia fuzzy subsequente
- Variaveis estimadas: dmp, rmp, densidade, n_espigas_com, peso_espigas
