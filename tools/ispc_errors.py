"""Módulo de tratamento de exceções e erros do pipeline ISPC.

Fornece classes de exceção personalizadas e utilitários para tratamento
robusto de erros em todo o pipeline.
"""

from __future__ import annotations

from typing import Any


# ============================================================================
# EXCEÇÕES PERSONALIZADAS
# ============================================================================

class ISPCError(Exception):
    """Classe base para todas as exceções do ISPC."""

    pass


class DataValidationError(ISPCError):
    """Exceção para erros de validação de dados."""

    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.details = details or {}


class MissingColumnError(DataValidationError):
    """Exceção para colunas faltantes em DataFrame."""

    def __init__(self, missing_cols: list[str], required_cols: list[str]):
        message = f"Colunas faltantes: {missing_cols}"
        details = {
            "missing": missing_cols,
            "required": required_cols,
        }
        super().__init__(message, details)


class InsufficientDataError(DataValidationError):
    """Exceção para dados insuficientes para treinamento."""

    def __init__(self, n_samples: int, min_required: int):
        message = f"Dados insuficientes: {n_samples} amostras (mínimo: {min_required})"
        details = {
            "n_samples": n_samples,
            "min_required": min_required,
        }
        super().__init__(message, details)


class ModelTrainingError(ISPCError):
    """Exceção para erros durante treinamento de modelo."""

    def __init__(self, message: str, model_params: dict[str, Any] | None = None):
        super().__init__(message)
        self.model_params = model_params or {}


class FileFormatError(ISPCError):
    """Exceção para erros de formato de arquivo."""

    def __init__(self, file_path: str, expected_format: str):
        message = f"Formato inválido em '{file_path}' (esperado: {expected_format})"
        super().__init__(message)
        self.file_path = file_path
        self.expected_format = expected_format


# ============================================================================
# VALIDADORES
# ============================================================================

def validate_columns(
    df: Any,
    required_cols: list[str],
    context: str = "DataFrame",
) -> None:
    """Valida presença de colunas obrigatórias em DataFrame.

    Args:
        df: DataFrame do pandas
        required_cols: Lista de colunas obrigatórias
        context: Contexto para mensagem de erro

    Raises:
        MissingColumnError: Se alguma coluna obrigatória estiver faltando
    """
    missing = [col for col in required_cols if col not in df.columns]

    if missing:
        raise MissingColumnError(missing, required_cols)


def validate_min_samples(
    n_samples: int,
    min_required: int,
    context: str = "Treinamento",
) -> None:
    """Valida número mínimo de amostras.

    Args:
        n_samples: Número atual de amostras
        min_required: Número mínimo requerido
        context: Contexto para mensagem de erro

    Raises:
        InsufficientDataError: Se não houver amostras suficientes
    """
    if n_samples < min_required:
        raise InsufficientDataError(n_samples, min_required)


def validate_file_exists(file_path: Any) -> None:
    """Valida existência de arquivo.

    Args:
        file_path: Caminho do arquivo (str ou Path)

    Raises:
        FileNotFoundError: Se arquivo não existir
    """
    from pathlib import Path

    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {file_path}")


# ============================================================================
# CONTEXT MANAGERS
# ============================================================================

class ErrorContext:
    """Context manager para adicionar contexto a exceções."""

    def __init__(self, context: str, logger: Any | None = None):
        """
        Args:
            context: Descrição do contexto atual
            logger: Logger opcional para registrar erros
        """
        self.context = context
        self.logger = logger

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None and self.logger is not None:
            from ispc_logging import log_error

            log_error(self.logger, exc_val, self.context)

        # Propaga exceção
        return False


# ============================================================================
# UTILITÁRIOS DE CONVERSÃO SEGURA
# ============================================================================

def safe_cast(
    value: Any,
    target_type: type,
    default: Any = None,
    allow_nan: bool = False,
) -> Any:
    """Converte valor para tipo alvo de forma segura.

    Args:
        value: Valor a converter
        target_type: Tipo alvo (int, float, str, etc.)
        default: Valor padrão se conversão falhar
        allow_nan: Se True, retorna None para NaN/Inf em floats

    Returns:
        Valor convertido ou default se conversão falhar

    Example:
        >>> safe_cast("42", int, default=0)
        42
        >>> safe_cast("invalid", int, default=0)
        0
        >>> safe_cast(float('nan'), float, allow_nan=True)
        None
    """
    if value is None:
        return default

    try:
        result = target_type(value)

        # Verifica NaN/Inf para floats
        if target_type == float and allow_nan:
            import numpy as np

            if not np.isfinite(result):
                return default

        return result

    except (ValueError, TypeError, OverflowError):
        return default


def safe_dict_get(
    d: dict[str, Any],
    key: str,
    target_type: type,
    default: Any = None,
) -> Any:
    """Obtém valor de dicionário com conversão de tipo segura.

    Args:
        d: Dicionário de origem
        key: Chave a buscar
        target_type: Tipo esperado do valor
        default: Valor padrão se key não existir ou conversão falhar

    Returns:
        Valor convertido ou default

    Example:
        >>> params = {"alpha": "1.0", "n": 100}
        >>> safe_dict_get(params, "alpha", float, 0.0)
        1.0
        >>> safe_dict_get(params, "missing", int, 10)
        10
    """
    value = d.get(key)

    if value is None:
        return default

    return safe_cast(value, target_type, default)


# ============================================================================
# VALIDAÇÃO DE DEPENDÊNCIAS
# ============================================================================

def check_dependencies(required_packages: list[str]) -> None:
    """Verifica se pacotes Python requeridos estão instalados.

    Args:
        required_packages: Lista de nomes de pacotes a verificar

    Raises:
        ImportError: Se algum pacote não estiver instalado

    Example:
        >>> check_dependencies(["pandas", "numpy", "sklearn"])
    """
    missing = []

    for package in required_packages:
        try:
            __import__(package)
        except ImportError:
            missing.append(package)

    if missing:
        packages_str = ", ".join(missing)
        raise ImportError(
            f"Pacotes faltantes: {packages_str}\n"
            f"Instale com: pip install {' '.join(missing)}"
        )
