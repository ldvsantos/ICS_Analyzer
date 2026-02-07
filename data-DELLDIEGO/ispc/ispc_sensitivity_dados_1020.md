# Analise de sensibilidade - ISPC (dados_1020)

- Total de registros: **108**
- Registros validos (comparaveis): **60**
- Entradas no modo reduzido: **10** (estima 5)

## Erro no score (0-10)

- Delta medio (reduzido - completo): 0.444
- MAE: 0.692
- RMSE: 1.507
- Max |delta|: 4.993

## Concordancia de classe

- Concordancia (%): 80.0

## Matriz de confusao (linhas = completo; colunas = reduzido)

| | Baixa | Media | Alta |
|---:|---:|---:|---:|
| Baixa | 1 | 4 | 4 |
| Media | 1 | 25 | 1 |
| Alta | 0 | 2 | 22 |

## Observacoes

- variaveis estimadas por ML (ridge) e inferencia fuzzy subsequente
- Variaveis estimadas: dmp, rmp, densidade, n_espigas_com, peso_espigas
