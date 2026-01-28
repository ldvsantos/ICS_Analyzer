# Analise de sensibilidade - ISPC reduzido (dados_010)

- Total de registros: **108**
- Registros validos (comparaveis): **76**
- Entradas no modo reduzido: **10** (estima 5)

## Erro no score (0-10)

- Delta medio (reduzido - completo): 0.151
- MAE: 0.329
- RMSE: 0.601
- Max |delta|: 2.237

## Concordancia de classe

- Concordancia (%): 78.9

## Matriz de confusao (linhas = completo; colunas = reduzido)

| | Baixa | Media | Alta |
|---:|---:|---:|---:|
| Baixa | 0 | 0 | 0 |
| Media | 0 | 53 | 14 |
| Alta | 0 | 2 | 7 |

## Observacoes

- modelos lineares ajustados no banco (calibracao primaria: 0-10 cm)
- Variaveis estimadas: dmp, rmp, densidade, n_espigas_com, peso_espigas
