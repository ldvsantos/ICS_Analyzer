"""Configurações centralizadas do pipeline ISPC.

Este módulo centraliza todos os parâmetros configuráveis do sistema,
facilitando ajustes e manutenção futura.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final


# ============================================================================
# CONFIGURAÇÕES DE MACHINE LEARNING
# ============================================================================

@dataclass(frozen=True)
class MLConfig:
    """Configurações de treinamento de modelos."""

    # Validação cruzada
    cv_folds: int = 3
    random_seed: int = 42
    cv_group_column: str = "parcela"

    # Ridge regression
    ridge_alpha_default: float = 1.0
    ridge_alpha_candidates: list[float] = None

    # Random Forest
    rf_n_estimators: int = 100
    rf_max_depth: int | None = None
    rf_min_samples_split: int = 2

    # Gradient Boosting
    gbr_n_estimators: int = 100
    gbr_max_depth: int = 3
    gbr_learning_rate: float = 0.1

    def __post_init__(self):
        if self.ridge_alpha_candidates is None:
            object.__setattr__(
                self, "ridge_alpha_candidates", [0.01, 0.1, 1.0, 10.0, 100.0]
            )


# ============================================================================
# CONFIGURAÇÕES DE QUALIDADE DE MODELO
# ============================================================================

@dataclass(frozen=True)
class ModelQualityThresholds:
    """Limiares de qualidade para classificação de modelos."""

    # Limiares de R² (coeficiente de determinação)
    r2_excellent: float = 0.85
    r2_good: float = 0.70
    r2_acceptable: float = 0.50

    # Limiares de RMSE relativo (% da amplitude do target)
    rmse_rel_excellent: float = 0.10  # 10% da amplitude
    rmse_rel_good: float = 0.20  # 20% da amplitude
    rmse_rel_acceptable: float = 0.30  # 30% da amplitude

    # Estabilidade (desvio padrão entre folds)
    stability_rmse_std_max: float = 0.15  # RMSE std < 15% da média
    stability_r2_std_max: float = 0.10  # R² std < 0.10


# ============================================================================
# CONFIGURAÇÕES DE CORRELAÇÃO
# ============================================================================

@dataclass(frozen=True)
class CorrelationConfig:
    """Configurações de análise de correlação."""

    # Método padrão: pearson, spearman, kendall
    default_method: str = "pearson"

    # Limiar para alta correlação (redundância)
    high_correlation_threshold: float = 0.85

    # Número máximo de pares a reportar
    max_pairs_report: int = 20


# ============================================================================
# CONFIGURAÇÕES DE PATHS
# ============================================================================

@dataclass(frozen=True)
class PathConfig:
    """Configurações de diretórios e arquivos."""

    # Diretórios
    data_dir: str = "data/ispc"
    tools_dir: str = "tools"
    docs_dir: str = "docs"
    assets_js_dir: str = "docs/assets/js"

    # Sufixos de arquivos
    records_suffix: str = "ispc_records"
    correlations_suffix: str = "ispc_correlations"
    high_corr_pairs_suffix: str = "ispc_high_corr_pairs"
    minmax_suffix: str = "ispc_minmax"

    # Arquivos de modelos
    models_base: str = "ispc_reduced_ml_models.json"
    models_production: str = "ispc_reduced_ml_models_production.json"
    tuning_report: str = "ispc_reduced_ml_tuning_report.csv"
    tuning_best: str = "ispc_reduced_ml_tuning_best.json"

    # Arquivos de qualidade
    quality_report: str = "model_quality_report.csv"
    quality_alerts: str = "model_quality_alerts.json"


# ============================================================================
# CONFIGURAÇÕES DE LOGGING
# ============================================================================

@dataclass(frozen=True)
class LoggingConfig:
    """Configurações de logging."""

    # Nível de log: DEBUG, INFO, WARNING, ERROR, CRITICAL
    level: str = "INFO"

    # Formato de log
    format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    # Formato de data
    date_format: str = "%Y-%m-%d %H:%M:%S"


# ============================================================================
# CONFIGURAÇÕES DE TUNING
# ============================================================================

@dataclass(frozen=True)
class TuningConfig:
    """Configurações de tuning de hiperparâmetros."""

    # Algoritmos a testar
    algorithms: list[str] = None

    # Peso da penalização por instabilidade
    std_weight: float = 0.5

    # Timeout por candidato (segundos)
    timeout_per_candidate: int = 300

    def __post_init__(self):
        if self.algorithms is None:
            object.__setattr__(self, "algorithms", ["ridge", "rf", "gbr"])


# ============================================================================
# INSTÂNCIAS PADRÃO
# ============================================================================

# Configurações padrão (podem ser sobrescritas via argumentos CLI)
DEFAULT_ML_CONFIG: Final[MLConfig] = MLConfig()
DEFAULT_QUALITY_THRESHOLDS: Final[ModelQualityThresholds] = ModelQualityThresholds()
DEFAULT_CORRELATION_CONFIG: Final[CorrelationConfig] = CorrelationConfig()
DEFAULT_PATH_CONFIG: Final[PathConfig] = PathConfig()
DEFAULT_LOGGING_CONFIG: Final[LoggingConfig] = LoggingConfig()
DEFAULT_TUNING_CONFIG: Final[TuningConfig] = TuningConfig()
