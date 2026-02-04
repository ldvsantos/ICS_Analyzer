# Estrutura do Projeto - ICS Analyzer

## 📁 Organização de Diretórios

### `/tools/` - Scripts Python

**Módulos Base (Infraestrutura)**
- `ispc_common.py` - Funções compartilhadas, métricas, CV, padronização
- `ispc_config.py` - Configurações centralizadas
- `ispc_logging.py` - Sistema de logging padronizado
- `ispc_errors.py` - Exceções e validadores
- `ispc_io.py` - Operações de I/O

**Pipeline Principal**
- `ispc_refresh_dashboard_artifacts.py` - Orquestrador do pipeline
- `ispc_pipeline.py` - Processamento de dados

**Machine Learning**
- `ispc_tune_reduced_ml_advanced.py` - Tuning de hiperparâmetros
- `ispc_train_reduced_ml_advanced.py` - Treinamento avançado
- `ispc_promote_reduced_ml.py` - Promoção para produção
- `ispc_train_reduced_ml.py` - Treinamento básico Ridge

**Qualidade e Análise**
- `ispc_model_quality_report.py` - Relatório de qualidade
- `ispc_model_quality_alerts.py` - Sistema de alertas

**Testes**
- `tests_ispc_pipeline.py` - 12 testes unitários
- `test_system_integration.py` - Teste de integração
- `run_all_tests.py` - Centralizador de testes

### `/data/ispc/` - Dados e Artefatos

**Entrada**
- `ispc_records_*.csv` - Dados por profundidade

**Saída ML**
- `ispc_reduced_ml_models*.json` - Modelos treinados
- `ispc_reduced_ml_tuning_*.{csv,json}` - Resultados de tuning
- `model_quality_*.{csv,json}` - Qualidade e alertas

**Análise**
- `ispc_correlations_*.csv` - Matrizes de correlação
- `ispc_minmax_*.json` - Estatísticas min/max
- `ispc_sensitivity_*.{json,md}` - Análise de sensibilidade

### `/docs/` - Dashboard Web

**Páginas**
- `index.html`, `dashboard.html`, `sistema.html`, `manual.html`

**JavaScript** (`/docs/assets/js/`)
- `app.js`, `ics_analyzer_*.js` - Aplicação
- `ispc_*_production.js` - Bundles UMD de modelos

**Documentação**
- `TESTES.md` - Documentação de testes
- `REFATORACAO.md` - Guia de refatoração

### `/desktop/` - Aplicação Electron

- `main.js`, `preload.js` - Processo Electron
- `package.json` - Dependências Node.js

## 🚀 Fluxo do Pipeline

```
Dados → Pipeline → ML → Qualidade → Dashboard
  ↓        ↓        ↓       ↓           ↓
CSV → Padronização → Tuning → Alertas → Web
```

## 🧹 Arquivos Ignorados (.gitignore)

- `__pycache__/`, `*.pyc` - Cache Python
- `/desktop/node_modules/` - Dependências Node
- `/desktop/dist*` - Builds temporários
- `data/ispc/test_data.csv` - Dados de teste

## 📝 Comandos Úteis

```bash
# Testes
pytest tools/tests_ispc_pipeline.py -v
python run_all_tests.py --full

# Pipeline completo
python tools/ispc_refresh_dashboard_artifacts.py

# Limpeza
Remove-Item -Recurse -Force tools\__pycache__
```

## ✅ Boas Práticas

- Use módulos de `ispc_common.py` (evita duplicação)
- Configure via `ispc_config.py` (sem hardcode)
- Log com `ispc_logging.py` (padronizado)
- Valide com `ispc_errors.py` (robusto)
- Execute testes antes de commit
- Mantenha `.gitignore` atualizado

## 📚 Documentação Completa

Consulte `docs/REFATORACAO.md` para detalhes da arquitetura.
