"""Módulo comum com constantes, estruturas de dados e funções compartilhadas do ISPC.

Este módulo centraliza código reutilizado em múltiplos scripts do pipeline,
seguindo o princípio DRY (Don't Repeat Yourself) e facilitando manutenção.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

import numpy as np
import pandas as pd


# ============================================================================
# CONSTANTES
# ============================================================================

# Colunas de entrada esperadas (10 features de entrada)
REQUIRED_INPUTS: Final[list[str]] = [
    "dmg",
    "estoque_c",
    "na",
    "icv",
    "altura",
    "diam_espiga",
    "comp_espiga",
    "n_plantas",
    "n_espigas",
    "produtividade",
]

# Variáveis alvo (5 features a serem preditas)
TARGETS: Final[list[str]] = [
    "dmp",
    "rmp",
    "densidade",
    "n_espigas_com",
    "peso_espigas",
]

# Todas as features do sistema (15 no total)
ALL_FEATURES: Final[list[str]] = [
    "dmg",
    "dmp",
    "rmp",
    "densidade",
    "estoque_c",
    "na",
    "icv",
    "altura",
    "diam_espiga",
    "comp_espiga",
    "n_plantas",
    "n_espigas",
    "n_espigas_com",
    "peso_espigas",
    "produtividade",
]

# Colunas de metadados
META_COLS: Final[list[str]] = ["ano", "profundidade_cm", "parcela", "cultura"]

# Tags de profundidade
DEPTH_TAG_0_10: Final[str] = "dados_010"
DEPTH_TAG_10_20: Final[str] = "dados_1020"
DEPTH_LABEL_0_10: Final[str] = "0-10"
DEPTH_LABEL_10_20: Final[str] = "10-20"


# ============================================================================
# ESTRUTURAS DE DADOS
# ============================================================================

@dataclass(frozen=True)
class Standardization:
    """Parâmetros de padronização (mean/std) para features."""

    mean: dict[str, float]
    std: dict[str, float]


@dataclass(frozen=True)
class SplitPlan:
    """Plano de divisão para validação cruzada."""

    k_used: int
    splits: list[tuple[np.ndarray, np.ndarray]]


# ============================================================================
# FUNÇÕES UTILITÁRIAS
# ============================================================================

def to_numeric_dataframe(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    """Converte colunas especificadas para tipo numérico.

    Args:
        df: DataFrame de entrada
        cols: Lista de nomes de colunas a converter

    Returns:
        DataFrame com colunas convertidas (valores inválidos viram NaN)
    """
    out = df.copy()
    for c in cols:
        out[c] = pd.to_numeric(out[c], errors="coerce")
    return out


def filter_by_depth_tag(df: pd.DataFrame, tag: str) -> pd.DataFrame:
    """Filtra DataFrame por tag de profundidade.

    Args:
        df: DataFrame com coluna 'profundidade_cm'
        tag: Tag de profundidade ('dados_010' ou 'dados_1020')

    Returns:
        DataFrame filtrado pela profundidade especificada
    """
    if "profundidade_cm" not in df.columns:
        return df

    s = df["profundidade_cm"].astype(str).str.strip()

    if tag == DEPTH_TAG_0_10:
        return df[s == DEPTH_LABEL_0_10].copy()
    elif tag == DEPTH_TAG_10_20:
        return df[s == DEPTH_LABEL_10_20].copy()
    else:
        return df


def parse_depth_tag(tag: str) -> str | None:
    """Converte tag de profundidade para rótulo legível.

    Args:
        tag: Tag de profundidade

    Returns:
        Rótulo de profundidade ou None se inválido
    """
    if tag == DEPTH_TAG_0_10:
        return DEPTH_LABEL_0_10
    elif tag == DEPTH_TAG_10_20:
        return DEPTH_LABEL_10_20
    else:
        return None


def safe_float_parse(x: any) -> float | None:
    """Converte valor para float de forma segura.

    Args:
        x: Valor a converter

    Returns:
        Valor como float ou None se conversão falhar
    """
    if x is None:
        return None
    if isinstance(x, (int, float)):
        v = float(x)
        return v if np.isfinite(v) else None
    try:
        v = float(x)
        return v if np.isfinite(v) else None
    except (ValueError, TypeError):
        return None


def safe_int_parse(x: any) -> int | None:
    """Converte valor para int de forma segura.

    Args:
        x: Valor a converter

    Returns:
        Valor como int ou None se conversão falhar
    """
    if x is None:
        return None
    if isinstance(x, int):
        return x
    if isinstance(x, float):
        return int(x) if np.isfinite(x) else None
    try:
        return int(float(x))
    except (ValueError, TypeError):
        return None


# ============================================================================
# MÉTRICAS DE AVALIAÇÃO
# ============================================================================

def rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Calcula Root Mean Squared Error.

    Args:
        y_true: Valores reais
        y_pred: Valores preditos

    Returns:
        RMSE como float
    """
    err = y_pred - y_true
    return float(np.sqrt(np.mean(err * err)))


def r2_score(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Calcula coeficiente de determinação (R²).

    Args:
        y_true: Valores reais
        y_pred: Valores preditos

    Returns:
        R² como float (1.0 se variância total for zero)
    """
    ss_res = float(np.sum((y_true - y_pred) ** 2))
    ss_tot = float(np.sum((y_true - float(np.mean(y_true))) ** 2))

    if ss_tot == 0:
        return 1.0

    return 1.0 - (ss_res / ss_tot)


# ============================================================================
# VALIDAÇÃO CRUZADA
# ============================================================================

def kfold_indices(n: int, k: int, seed: int) -> SplitPlan:
    """Gera índices para validação cruzada K-Fold.

    Args:
        n: Número total de amostras
        k: Número de folds desejado
        seed: Seed para reprodutibilidade

    Returns:
        SplitPlan com índices de treino/teste para cada fold
    """
    rng = np.random.default_rng(seed)
    idx = np.arange(n)
    rng.shuffle(idx)

    used_k = min(k, n)
    if used_k < 2:
        return SplitPlan(k_used=0, splits=[])

    folds = np.array_split(idx, used_k)
    out: list[tuple[np.ndarray, np.ndarray]] = []

    for i in range(used_k):
        test_idx = folds[i]
        train_idx = np.concatenate([folds[j] for j in range(used_k) if j != i])

        if test_idx.size == 0 or train_idx.size == 0:
            continue

        out.append((train_idx, test_idx))

    return SplitPlan(k_used=len(out), splits=out)


def group_kfold_indices(groups: np.ndarray, k: int, seed: int) -> SplitPlan:
    """Gera índices para Group K-Fold (evita vazamento por grupo).

    Args:
        groups: Array 1D com identificadores de grupo
        k: Número de folds desejado
        seed: Seed para reprodutibilidade

    Returns:
        SplitPlan com índices de treino/teste respeitando grupos

    Raises:
        ValueError: Se groups não for 1D
    """
    if groups.ndim != 1:
        raise ValueError("groups precisa ser array 1D")

    g = groups.astype(str)
    uniq = np.unique(g)
    rng = np.random.default_rng(seed)
    rng.shuffle(uniq)

    used_k = min(k, len(uniq))
    if used_k < 2:
        return SplitPlan(k_used=0, splits=[])

    folds = np.array_split(uniq, used_k)
    out: list[tuple[np.ndarray, np.ndarray]] = []
    all_idx = np.arange(g.shape[0])

    for i in range(used_k):
        test_groups = set(folds[i].tolist())
        test_mask = np.array([gg in test_groups for gg in g], dtype=bool)
        test_idx = all_idx[test_mask]
        train_idx = all_idx[~test_mask]

        if test_idx.size == 0 or train_idx.size == 0:
            continue

        out.append((train_idx, test_idx))

    return SplitPlan(k_used=len(out), splits=out)


# ============================================================================
# PADRONIZAÇÃO
# ============================================================================

def standardize_features(
    df: pd.DataFrame, cols: list[str]
) -> tuple[np.ndarray, Standardization]:
    """Padroniza features (z-score) e retorna array + parâmetros.

    Args:
        df: DataFrame de entrada
        cols: Lista de colunas a padronizar

    Returns:
        Tupla (array padronizado, parâmetros de padronização)
    """
    means: dict[str, float] = {}
    stds: dict[str, float] = {}
    arr = []

    for c in cols:
        v = df[c].to_numpy(dtype=float)
        m = float(np.nanmean(v))
        s = float(np.nanstd(v, ddof=0))

        # Evita divisão por zero
        if not np.isfinite(s) or s == 0:
            s = 1.0

        means[c] = m
        stds[c] = s
        arr.append((v - m) / s)

    X = np.stack(arr, axis=1)
    return X, Standardization(mean=means, std=stds)


def apply_standardization(
    df: pd.DataFrame, cols: list[str], st: Standardization
) -> np.ndarray:
    """Aplica padronização existente a novos dados.

    Args:
        df: DataFrame de entrada
        cols: Lista de colunas a padronizar
        st: Parâmetros de padronização (mean/std)

    Returns:
        Array padronizado
    """
    arr = []
    for c in cols:
        v = df[c].to_numpy(dtype=float)
        m = st.mean[c]
        s = st.std[c]
        arr.append((v - m) / s)

    return np.stack(arr, axis=1)


# ============================================================================
# RIDGE REGRESSION
# ============================================================================

def ridge_fit(X: np.ndarray, y: np.ndarray, alpha: float) -> tuple[float, np.ndarray]:
    """Treina regressão ridge com intercepto (não penalizado).

    Args:
        X: Features (n_samples, n_features)
        y: Target (n_samples,)
        alpha: Parâmetro de regularização L2

    Returns:
        Tupla (intercepto, coeficientes)
    """
    n = X.shape[0]
    ones = np.ones((n, 1), dtype=float)
    X_aug = np.concatenate([ones, X], axis=1)

    p = X_aug.shape[1]
    penalty = np.eye(p, dtype=float)
    penalty[0, 0] = 0.0  # Não penaliza intercepto

    XtX = X_aug.T @ X_aug
    XtX_reg = XtX + alpha * penalty
    Xty = X_aug.T @ y

    try:
        w = np.linalg.solve(XtX_reg, Xty)
    except np.linalg.LinAlgError:
        # Fallback para pseudoinversa se matriz singular
        w = np.linalg.lstsq(XtX_reg, Xty, rcond=None)[0]

    intercept = float(w[0])
    weights = w[1:]

    return intercept, weights


def ridge_predict(X: np.ndarray, intercept: float, weights: np.ndarray) -> np.ndarray:
    """Faz predições com modelo ridge treinado.

    Args:
        X: Features (n_samples, n_features)
        intercept: Intercepto do modelo
        weights: Coeficientes do modelo

    Returns:
        Predições (n_samples,)
    """
    return intercept + X @ weights
