"""Sistema de logging padronizado para o pipeline ISPC.

Fornece funcionalidades de logging consistentes em todos os módulos,
com suporte a diferentes níveis e formatação uniforme.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Any

from ispc_config import DEFAULT_LOGGING_CONFIG


def setup_logger(
    name: str,
    level: str | None = None,
    log_file: Path | None = None,
) -> logging.Logger:
    """Configura e retorna um logger padronizado.

    Args:
        name: Nome do logger (geralmente __name__ do módulo)
        level: Nível de log (DEBUG, INFO, WARNING, ERROR, CRITICAL)
               Se None, usa configuração padrão
        log_file: Caminho opcional para arquivo de log
                  Se None, apenas imprime no console

    Returns:
        Logger configurado

    Example:
        >>> logger = setup_logger(__name__)
        >>> logger.info("Pipeline iniciado")
    """
    logger = logging.getLogger(name)

    # Evita duplicação de handlers
    if logger.handlers:
        return logger

    # Configura nível
    log_level = level or DEFAULT_LOGGING_CONFIG.level
    logger.setLevel(getattr(logging, log_level))

    # Formata mensagens
    formatter = logging.Formatter(
        DEFAULT_LOGGING_CONFIG.format, datefmt=DEFAULT_LOGGING_CONFIG.date_format
    )

    # Handler para console
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # Handler para arquivo (opcional)
    if log_file is not None:
        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger


def log_parameters(logger: logging.Logger, params: dict[str, Any]) -> None:
    """Registra parâmetros de configuração no log.

    Args:
        logger: Logger configurado
        params: Dicionário de parâmetros a registrar

    Example:
        >>> log_parameters(logger, {"cv_folds": 3, "seed": 42})
    """
    logger.info("=" * 60)
    logger.info("PARÂMETROS DE EXECUÇÃO")
    logger.info("=" * 60)

    for key, value in params.items():
        logger.info(f"  {key}: {value}")

    logger.info("=" * 60)


def log_section(logger: logging.Logger, title: str) -> None:
    """Registra cabeçalho de seção no log.

    Args:
        logger: Logger configurado
        title: Título da seção

    Example:
        >>> log_section(logger, "Carregando dados")
    """
    logger.info("")
    logger.info("=" * 60)
    logger.info(title.upper())
    logger.info("=" * 60)


def log_dataframe_info(
    logger: logging.Logger, df: Any, name: str = "DataFrame"
) -> None:
    """Registra informações sobre um DataFrame.

    Args:
        logger: Logger configurado
        df: DataFrame do pandas
        name: Nome descritivo do DataFrame

    Example:
        >>> log_dataframe_info(logger, df, "Dados de treinamento")
    """
    logger.info(f"{name}: {df.shape[0]} linhas × {df.shape[1]} colunas")

    # Verifica valores faltantes
    missing = df.isnull().sum()
    if missing.sum() > 0:
        logger.warning(f"  Valores faltantes detectados:")
        for col, count in missing[missing > 0].items():
            pct = 100 * count / len(df)
            logger.warning(f"    {col}: {count} ({pct:.1f}%)")


def log_cv_results(
    logger: logging.Logger,
    fold_results: list[dict[str, float]],
    target: str,
) -> None:
    """Registra resultados de validação cruzada.

    Args:
        logger: Logger configurado
        fold_results: Lista de dicionários com métricas por fold
        target: Nome da variável alvo

    Example:
        >>> results = [{"r2": 0.85, "rmse": 12.3}, {"r2": 0.82, "rmse": 13.1}]
        >>> log_cv_results(logger, results, "dmp")
    """
    import numpy as np

    logger.info(f"Resultados CV para '{target}':")

    # Extrai métricas
    metrics = set()
    for fold in fold_results:
        metrics.update(fold.keys())

    # Calcula estatísticas
    for metric in sorted(metrics):
        values = [f[metric] for f in fold_results if metric in f]
        if not values:
            continue

        mean = np.mean(values)
        std = np.std(values)
        logger.info(f"  {metric}: {mean:.4f} ± {std:.4f}")


def log_error(logger: logging.Logger, error: Exception, context: str = "") -> None:
    """Registra erro com contexto adicional.

    Args:
        logger: Logger configurado
        error: Exceção capturada
        context: Contexto adicional sobre o erro

    Example:
        >>> try:
        ...     dangerous_operation()
        ... except Exception as e:
        ...     log_error(logger, e, "Durante tuning do modelo")
    """
    logger.error("=" * 60)
    logger.error("ERRO DETECTADO")

    if context:
        logger.error(f"Contexto: {context}")

    logger.error(f"Tipo: {type(error).__name__}")
    logger.error(f"Mensagem: {str(error)}")
    logger.error("=" * 60)


def log_summary(
    logger: logging.Logger,
    title: str,
    items: dict[str, Any],
) -> None:
    """Registra sumário formatado.

    Args:
        logger: Logger configurado
        title: Título do sumário
        items: Dicionário com itens a sumarizar

    Example:
        >>> log_summary(logger, "Resultados Finais", {
        ...     "Modelos treinados": 15,
        ...     "R² médio": 0.82,
        ...     "Tempo total": "5.2 min"
        ... })
    """
    logger.info("")
    logger.info("=" * 60)
    logger.info(title.upper())
    logger.info("=" * 60)

    for key, value in items.items():
        logger.info(f"  {key}: {value}")

    logger.info("=" * 60)
