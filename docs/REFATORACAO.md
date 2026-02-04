# Guia de Refatoração - Pipeline ISPC

## Visão Geral

Este documento descreve a refatoração aplicada ao código do pipeline ISPC para melhorar manutenibilidade, legibilidade e seguir boas práticas de engenharia de software.

## Princípios Aplicados

### 1. DRY (Don't Repeat Yourself)
- **Problema**: Código duplicado em múltiplos scripts (funções de padronização, métricas, validação cruzada)
- **Solução**: Módulo `ispc_common.py` com funções compartilhadas

### 2. Separação de Responsabilidades (SoC)
- **Problema**: Scripts monolíticos com lógica misturada
- **Solução**: Módulos especializados
  - `ispc_common.py`: Funções utilitárias e métricas
  - `ispc_config.py`: Configurações centralizadas
  - `ispc_logging.py`: Sistema de logging uniforme
  - `ispc_errors.py`: Exceções e validadores
  - `ispc_io.py`: Operações de I/O

### 3. Código Limpo (Clean Code)
- **Docstrings**: Documentação completa no estilo Google
- **Type Hints**: Anotações de tipo em todas as funções
- **Nomes Descritivos**: Funções e variáveis com nomes claros
- **Funções Pequenas**: Máximo ~50 linhas por função

### 4. Tratamento Robusto de Erros
- **Exceções Personalizadas**: Classes específicas para cada tipo de erro
- **Validação Explícita**: Validadores para dados, arquivos e parâmetros
- **Context Managers**: Para adicionar contexto a erros

## Estrutura dos Novos Módulos

### `ispc_common.py`
```python
# Constantes
REQUIRED_INPUTS: list[str]
TARGETS: list[str]
ALL_FEATURES: list[str]
META_COLS: list[str]

# Estruturas de dados
@dataclass Standardization
@dataclass SplitPlan

# Funções utilitárias
to_numeric_dataframe()
filter_by_depth_tag()
safe_float_parse()
safe_int_parse()

# Métricas
rmse()
r2_score()

# Validação cruzada
kfold_indices()
group_kfold_indices()

# Padronização
standardize_features()
apply_standardization()

# Regressão Ridge
ridge_fit()
ridge_predict()
```

### `ispc_config.py`
```python
# Classes de configuração
@dataclass MLConfig
@dataclass ModelQualityThresholds
@dataclass CorrelationConfig
@dataclass PathConfig
@dataclass LoggingConfig
@dataclass TuningConfig

# Instâncias padrão
DEFAULT_ML_CONFIG
DEFAULT_QUALITY_THRESHOLDS
# ...
```

### `ispc_logging.py`
```python
# Funções principais
setup_logger()
log_parameters()
log_section()
log_dataframe_info()
log_cv_results()
log_error()
log_summary()
```

### `ispc_errors.py`
```python
# Exceções
ISPCError (base)
DataValidationError
MissingColumnError
InsufficientDataError
ModelTrainingError
FileFormatError

# Validadores
validate_columns()
validate_min_samples()
validate_file_exists()

# Utilitários
safe_cast()
safe_dict_get()
check_dependencies()

# Context manager
ErrorContext
```

### `ispc_io.py`
```python
# Leitura
load_records_csv()
load_records_for_tag()
load_json()
load_tuning_report_csv()

# Escrita
save_dataframe_csv()
save_json()
save_csv_from_dicts()
write_js_umd()

# Utilitários
ensure_directory()
list_csv_files()
backup_file()
```

## Padrão de Refatoração

### Antes
```python
def train_model(csv_path: str):
    # Código duplicado de carregamento
    df = pd.read_csv(csv_path)
    for c in META_COLS:
        if c not in df.columns:
            raise ValueError(f"Missing {c}")
    
    # Código duplicado de padronização
    means = {}
    stds = {}
    for c in features:
        v = df[c].to_numpy()
        m = float(np.nanmean(v))
        s = float(np.nanstd(v))
        if s == 0:
            s = 1.0
        means[c] = m
        stds[c] = s
    
    # Código duplicado de métricas
    err = y_pred - y_true
    rmse = float(np.sqrt(np.mean(err * err)))
    
    # Sem logging
    # Sem tratamento robusto de erros
```

### Depois
```python
def train_model(csv_path: Path) -> dict[str, Any]:
    """Treina modelo de regressão.

    Args:
        csv_path: Caminho do arquivo CSV com dados

    Returns:
        Dicionário com métricas e parâmetros do modelo

    Raises:
        MissingColumnError: Se colunas obrigatórias estiverem faltando
        InsufficientDataError: Se dados insuficientes
    """
    from ispc_common import REQUIRED_INPUTS, standardize_features, rmse, r2_score
    from ispc_io import load_records_csv
    from ispc_logging import setup_logger, log_section
    from ispc_errors import ErrorContext, validate_min_samples

    logger = setup_logger(__name__)
    log_section(logger, "Treinando modelo")

    # Carregamento robusto
    with ErrorContext("Carregando dados", logger):
        df = load_records_csv(csv_path, required_cols=REQUIRED_INPUTS)
        validate_min_samples(len(df), min_required=10)

    # Padronização reutilizável
    X, std_params = standardize_features(df, REQUIRED_INPUTS)

    # Métricas padronizadas
    metrics = {
        "rmse": rmse(y_true, y_pred),
        "r2": r2_score(y_true, y_pred),
    }

    return metrics
```

## Benefícios

### Manutenibilidade
- ✅ Código duplicado eliminado
- ✅ Mudanças em um único lugar
- ✅ Testes mais fáceis

### Legibilidade
- ✅ Funções curtas e focadas
- ✅ Nomes descritivos
- ✅ Documentação completa

### Robustez
- ✅ Tratamento consistente de erros
- ✅ Validação explícita
- ✅ Logging estruturado

### Extensibilidade
- ✅ Fácil adicionar novas features
- ✅ Configuração centralizada
- ✅ Módulos independentes

## Plano de Migração

### Fase 1: Módulos Base (✅ Completo)
- [x] `ispc_common.py`
- [x] `ispc_config.py`
- [x] `ispc_logging.py`
- [x] `ispc_errors.py`
- [x] `ispc_io.py`

### Fase 2: Refatoração de Scripts Principais
- [ ] `ispc_pipeline.py`
- [ ] `ispc_promote_reduced_ml.py`
- [ ] `ispc_tune_reduced_ml_advanced.py`
- [ ] `ispc_train_reduced_ml_advanced.py`
- [ ] `ispc_model_quality_alerts.py`

### Fase 3: Refatoração de Scripts Auxiliares
- [ ] `ispc_refresh_dashboard_artifacts.py`
- [ ] `test_system_integration.py`
- [ ] `tests_ispc_pipeline.py`

### Fase 4: Validação e Testes
- [ ] Executar suite de testes
- [ ] Validar pipeline completo
- [ ] Verificar compatibilidade com dashboard

## Como Usar os Novos Módulos

### Exemplo 1: Carregamento de Dados
```python
from pathlib import Path
from ispc_io import load_records_for_tag
from ispc_common import filter_by_depth_tag

data_dir = Path("data/ispc")
df = load_records_for_tag(data_dir, "dados_010")
```

### Exemplo 2: Treinamento com Logging
```python
from ispc_logging import setup_logger, log_section, log_cv_results

logger = setup_logger(__name__)
log_section(logger, "Validação Cruzada")

# ... treina modelo ...

log_cv_results(logger, fold_results, target="dmp")
```

### Exemplo 3: Tratamento de Erros
```python
from ispc_errors import ErrorContext, validate_columns

with ErrorContext("Processando CSV", logger):
    validate_columns(df, required_cols=["dmg", "dmp"])
```

### Exemplo 4: Configuração
```python
from ispc_config import DEFAULT_ML_CONFIG

cv_folds = DEFAULT_ML_CONFIG.cv_folds
seed = DEFAULT_ML_CONFIG.random_seed
```

## Compatibilidade com Código Existente

Os módulos antigos **não** serão removidos imediatamente. A migração será gradual:

1. **Fase 1**: Módulos novos coexistem com código antigo
2. **Fase 2**: Scripts migram gradualmente para usar novos módulos
3. **Fase 3**: Código antigo é marcado como deprecated
4. **Fase 4**: Código antigo é removido (após validação completa)

## Checklist de Refatoração por Script

Para cada script a refatorar:

- [ ] Importar módulos comuns (ispc_common, ispc_config, etc.)
- [ ] Substituir constantes por imports de ispc_common
- [ ] Substituir funções duplicadas por versões de ispc_common
- [ ] Adicionar logging usando ispc_logging
- [ ] Substituir validações por funções de ispc_errors
- [ ] Usar ispc_io para operações de leitura/escrita
- [ ] Adicionar/melhorar docstrings
- [ ] Adicionar type hints completos
- [ ] Testar compatibilidade com pipeline existente

## Métricas de Qualidade

### Antes da Refatoração
- Duplicação de código: ~40%
- Linhas por função: 80-150
- Cobertura de docstrings: ~30%
- Type hints: ~50%

### Após Refatoração (Meta)
- Duplicação de código: <10%
- Linhas por função: <50
- Cobertura de docstrings: 100%
- Type hints: 100%

## Contato e Suporte

Para dúvidas sobre a refatoração:
- Consulte este documento
- Leia docstrings dos módulos novos
- Veja exemplos em `tests_ispc_pipeline.py`
