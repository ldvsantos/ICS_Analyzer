# Testes de Sistema ICS Analyzer

Estrutura de testes para validação do sistema ISPC (redução de modelos ML para predição de atributos de solo).

## Estrutura

### 1. **tests_ispc_pipeline.py** - Testes Unitários
Valida funções isoladas do pipeline com dados sintéticos.

**Cobertura:**
- ✓ Carregamento e padronização de dados CSV
- ✓ Cálculo de correlações (Pearson/Spearman)
- ✓ Identificação de pares correlacionados
- ✓ Classificação de qualidade de modelos (alertas)
- ✓ Filtragem de registros por profundidade
- ✓ Fluxo integrado ponta a ponta

**Executar:**
```bash
python -m pytest tools/tests_ispc_pipeline.py -v
```

**Resultado esperado:** 12 testes passando em < 1 segundo

---

### 2. **test_system_integration.py** - Teste de Integração
Alimenta o sistema com dados sintéticos e valida saída ponta a ponta.

**Fluxo:**
1. Gera 100 registros sintéticos com distribuições realistas
2. Executa pipeline de refresh (tuning ML + produção + alertas)
3. Valida 6 artefatos principais:
   - CSV de relatório de tuning
   - JSON dos melhores modelos
   - JS bundle para dashboard
   - JSON dos modelos de produção
   - JSON de alertas de qualidade
   - CSV do relatório de qualidade

**Executar:**
```bash
python tools/test_system_integration.py
```

**Exemplo de saída:**
```
============================================================
TESTES DE INTEGRACAO: ALIMENTACAO E VALIDACAO ISPC
============================================================

1. Gerando dados sinteticos...
OK: Dados sintéticos gerados: data/ispc/test_data.csv (100 registros)

2. Executando pipeline de refresh...
OK: Pipeline completou com sucesso
  OK: data/ispc/ispc_reduced_ml_tuning_report.csv
  OK: data/ispc/ispc_reduced_ml_tuning_best.json
  ...

3. Validando artefatos gerados...
  [OK] Relatório de tuning (CSV): ispc_reduced_ml_tuning_report.csv
  [OK] Melhores modelos (JSON): ispc_reduced_ml_tuning_best.json
  [OK] Modelos produção (JSON): ispc_reduced_ml_models_production.json
  [OK] Alertas de qualidade (JSON): model_quality_alerts.json
  [OK] Relatório de qualidade (CSV): model_quality_report.csv

============================================================
Resultados: 5/6 artefatos OK (83%)
============================================================

SUCESSO: Todos os artefatos foram gerados corretamente!
```

---

## Dados de Teste

### Estrutura
Os dados sintéticos incluem:
- **Entrada (10 features):** dmg, dmp, rmp, densidade, estoque_c, na, icv, altura, diam_espiga, comp_espiga, n_plantas, n_espigas
- **Saída (5 targets):** dmp, rmp, densidade, n_espigas_com, peso_espigas, produtividade
- **Metadados:** ano, profundidade_cm, parcela, cultura

### Geração
Usa distribuição normal com:
- Seed fixo (42) para reprodutibilidade
- Valores realistas baseados em dados agronômicos
- Dois grupos de profundidade (0-10 cm e 10-20 cm)
- Múltiplas culturas e parcelas

---

## Validações Implementadas

### Nível de Função
1. **Padronização:** Verifica conversão de colunas para formato numérico
2. **Correlações:** Confirma cálculo correto de r de Pearson
3. **Pares:** Detecta alta correlação entre variáveis (r > 0.85)
4. **Alertas:** Classifica severidade (ok, alerta, crítico) conforme thresholds
5. **Filtragem:** Segrega dados por profundidade corretamente

### Nível de Sistema
1. **Existência:** Verifica presença de todos os artefatos gerados
2. **Tamanho:** Confirma que JSONs e CSVs não são vazios
3. **Formato:** Valida estrutura JSON e presença de chaves esperadas
4. **Completude:** Assegura que os dados fluxam corretamente entre estágios

---

## Adicionando Novos Testes

### Teste Unitário
1. Edite `tests_ispc_pipeline.py`
2. Adicione nova classe `TestXXX` ou método `test_*` em classe existente
3. Use padrão `assert` ou `pytest` para validações
4. Execute: `pytest tools/tests_ispc_pipeline.py::TestXXX -v`

### Teste de Integração
1. Edite `test_system_integration.py`
2. Adicione nova validação em `validate_artifacts()` ou novo stage em `main()`
3. Retorne status no dict `results`
4. Execute: `python tools/test_system_integration.py`

---

## Troubleshooting

| Problema | Causa | Solução |
|----------|-------|--------|
| Testes de unidade falham | Função alterada sem adaptar test | Revisar assinatura e comportamento da função |
| Pipeline expirou (>300s) | Tuning ML é lento | Aumentar timeout ou usar subset menor de dados |
| Artefato JS não validado | Bundle não gerado | Verificar se `--out-js` é passado no pipeline |
| Erro de encoding | Terminal em cp1252 | Use Python com UTF-8 ou evite caracteres especiais |

---

## CI/CD Integration

Os testes podem ser integrados ao GitHub Actions:

```yaml
- name: Run ISPC tests
  run: |
    python -m pytest tools/tests_ispc_pipeline.py -v
    python tools/test_system_integration.py
```

---

**Última atualização:** 4 de fevereiro de 2026
**Mantido por:** ICS Analyzer Team
