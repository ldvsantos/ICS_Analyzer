# Relatório de redução de variáveis ISPC (profundidade 0-10 cm)

- Método de correlação: `pearson`
- Limiar de |r| para considerar redundância: `0.85`

## Pares com maior correlação (top 20)

- n_espigas_com × produtividade: r=1.000
- n_espigas_com × peso_espigas: r=0.973
- peso_espigas × produtividade: r=0.973
- densidade × estoque_c: r=0.972
- dmg × rmp: r=0.923
- dmp × rmp: r=0.920

## Clusters de redundância (componentes conexas)

- Cluster 1: dmg, dmp, rmp
- Cluster 2: n_espigas_com, peso_espigas, produtividade
- Cluster 3: densidade, estoque_c

## Sugestão prática de redução

A sugestão abaixo é **conservadora**: para cada cluster, tente manter 1 variável representativa e remover as demais **somente após** validar se a interpretação científica continua consistente (ex.: regressões, sensibilidade do índice fuzzy, validação cruzada).

- Cluster 1: manter `dmg`; candidatos a remover: `dmp`, `rmp`
- Cluster 2: manter `produtividade`; candidatos a remover: `n_espigas_com`, `peso_espigas`
- Cluster 3: manter `estoque_c`; candidatos a remover: `densidade`
