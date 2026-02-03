"""Treina modelos avançados (ensemble) para estimar as 5 variáveis do ISPC reduzido.

Objetivo
- Complementar (não substituir) o ridge leve já usado no cliente.
- Gerar artefatos offline (pickle) + metadata JSON para rastreabilidade.

Saída
- JSON com métricas de validação + caminhos dos modelos.
- Arquivos .pkl por profundidade/tag e target.

Dependências (opcionais)
- scikit-learn (obrigatório para RF/GB)
- xgboost (opcional, se quiser --algo xgb)

Uso típico
  python tools/ispc_train_reduced_ml_advanced.py --data-dir data/ispc --tags dados_010,dados_1020 --algo rf
"""

from __future__ import annotations

import argparse
import json
import pickle
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd


REQUIRED_INPUTS_10 = [
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

TARGETS_5 = [
    "dmp",
    "rmp",
    "densidade",
    "n_espigas_com",
    "peso_espigas",
]

META_COLS = ["ano", "profundidade_cm", "parcela", "cultura"]


@dataclass(frozen=True)
class Standardization:
    mean: dict[str, float]
    std: dict[str, float]


def _to_numeric_frame(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    out = df.copy()
    for c in cols:
        out[c] = pd.to_numeric(out[c], errors="coerce")
    return out


def _standardize(df: pd.DataFrame, cols: list[str]) -> tuple[np.ndarray, Standardization]:
    means: dict[str, float] = {}
    stds: dict[str, float] = {}

    arr = []
    for c in cols:
        v = df[c].to_numpy(dtype=float)
        m = float(np.nanmean(v))
        s = float(np.nanstd(v, ddof=0))
        if not np.isfinite(s) or s == 0:
            s = 1.0
        means[c] = m
        stds[c] = s
        arr.append((v - m) / s)

    X = np.stack(arr, axis=1)
    return X, Standardization(mean=means, std=stds)


def _fit_standardization(df: pd.DataFrame, cols: list[str]) -> Standardization:
    means: dict[str, float] = {}
    stds: dict[str, float] = {}

    for c in cols:
        v = df[c].to_numpy(dtype=float)
        m = float(np.nanmean(v))
        s = float(np.nanstd(v, ddof=0))
        if not np.isfinite(s) or s == 0:
            s = 1.0
        means[c] = m
        stds[c] = s

    return Standardization(mean=means, std=stds)


def _apply_standardization(df: pd.DataFrame, cols: list[str], st: Standardization) -> np.ndarray:
    arr = []
    for c in cols:
        v = df[c].to_numpy(dtype=float)
        arr.append((v - float(st.mean[c])) / float(st.std[c]))
    return np.stack(arr, axis=1)


def _rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    err = y_pred - y_true
    return float(np.sqrt(np.mean(err * err)))


def _r2(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    ss_res = float(np.sum((y_true - y_pred) ** 2))
    ss_tot = float(np.sum((y_true - float(np.mean(y_true))) ** 2))
    if ss_tot == 0:
        return 1.0
    return 1.0 - (ss_res / ss_tot)


def _kfold_indices(n: int, k: int, seed: int) -> list[tuple[np.ndarray, np.ndarray]]:
    rng = np.random.default_rng(seed)
    idx = np.arange(n)
    rng.shuffle(idx)
    folds = np.array_split(idx, k)
    out: list[tuple[np.ndarray, np.ndarray]] = []
    for i in range(k):
        test_idx = folds[i]
        train_idx = np.concatenate([folds[j] for j in range(k) if j != i])
        out.append((train_idx, test_idx))
    return out


def _group_kfold_indices(groups: np.ndarray, k: int, seed: int) -> list[tuple[np.ndarray, np.ndarray]]:
    """K-fold por grupos (evita vazamento entre linhas do mesmo grupo)."""
    if groups.ndim != 1:
        raise ValueError("groups precisa ser 1D")

    g = groups.astype(str)
    uniq = np.unique(g)
    rng = np.random.default_rng(seed)
    rng.shuffle(uniq)

    used_k = int(min(int(k), int(len(uniq))))
    if used_k < 2:
        return []

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

    return out


def _make_model(algo: str, seed: int):
    algo = algo.strip().lower()

    try:
        from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(
            "scikit-learn não está instalado. Instale com: pip install scikit-learn"
        ) from exc

    if algo == "rf":
        return RandomForestRegressor(
            n_estimators=400,
            random_state=seed,
            n_jobs=-1,
            min_samples_leaf=2,
        )

    if algo == "gbr":
        return GradientBoostingRegressor(
            random_state=seed,
            n_estimators=500,
            learning_rate=0.05,
            max_depth=3,
        )

    if algo == "xgb":
        try:
            from xgboost import XGBRegressor  # type: ignore
        except Exception as exc:  # noqa: BLE001
            raise SystemExit(
                "xgboost não está instalado. Instale com: pip install xgboost"
            ) from exc

        return XGBRegressor(
            n_estimators=800,
            learning_rate=0.05,
            max_depth=4,
            subsample=0.9,
            colsample_bytree=0.9,
            reg_lambda=1.0,
            random_state=seed,
            n_jobs=-1,
        )

    raise SystemExit("--algo inválido. Use: rf | gbr | xgb")


def load_records(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)

    for c in META_COLS:
        if c not in df.columns:
            raise ValueError(f"CSV faltando coluna meta: {c}")

    df = _to_numeric_frame(df, REQUIRED_INPUTS_10 + TARGETS_5)
    return df


def train_one_target(df: pd.DataFrame, target: str, algo: str, k: int, seed: int, cv_group: str | None) -> dict:
    cols = REQUIRED_INPUTS_10 + [target]
    if cv_group:
        cols.append(cv_group)

    sub = df[cols].dropna()
    if sub.empty or sub.shape[0] < max(20, k * 4):
        return {"ok": False, "reason": "not_enough_rows", "n": int(sub.shape[0])}

    y = sub[target].to_numpy(dtype=float)

    if cv_group:
        splits = _group_kfold_indices(sub[cv_group].to_numpy(), k=k, seed=seed)
        if not splits:
            return {
                "ok": False,
                "reason": "not_enough_groups",
                "n": int(sub.shape[0]),
                "cv_group": str(cv_group),
            }
    else:
        splits = _kfold_indices(sub.shape[0], k=k, seed=seed)

    fold_data = []
    for train_idx, test_idx in splits:
        train_df = sub.iloc[train_idx]
        test_df = sub.iloc[test_idx]
        st_fold = _fit_standardization(train_df, REQUIRED_INPUTS_10)
        X_train = _apply_standardization(train_df, REQUIRED_INPUTS_10, st_fold)
        X_test = _apply_standardization(test_df, REQUIRED_INPUTS_10, st_fold)
        y_train = train_df[target].to_numpy(dtype=float)
        y_test = test_df[target].to_numpy(dtype=float)
        fold_data.append((X_train, y_train, X_test, y_test, int(train_idx.size), int(test_idx.size)))

    used_k = int(len(fold_data))
    if used_k < 2:
        return {
            "ok": False,
            "reason": "not_enough_folds",
            "n": int(sub.shape[0]),
            "k": int(k),
            "cv_group": str(cv_group) if cv_group else None,
        }

    rmses = []
    r2s = []
    cv_folds = []
    for X_train, y_train, X_test, y_test, n_train, n_test in fold_data:
        model = _make_model(algo, seed=seed)
        model.fit(X_train, y_train)
        yhat = model.predict(X_test)
        rmse = _rmse(y_test, yhat)
        r2 = _r2(y_test, yhat)
        rmses.append(rmse)
        r2s.append(r2)
        cv_folds.append({"n_train": int(n_train), "n_test": int(n_test), "rmse": rmse, "r2": r2})

    # treinar final em tudo
    X_all, st = _standardize(sub, REQUIRED_INPUTS_10)
    final_model = _make_model(algo, seed=seed)
    final_model.fit(X_all, y)
    yhat_train = final_model.predict(X_all)

    return {
        "ok": True,
        "n": int(X_all.shape[0]),
        "algo": algo,
        "cv": {
            "k": int(used_k),
            "seed": int(seed),
            "rmse": float(np.mean(rmses)),
            "r2": float(np.mean(r2s)),
            "group": (str(cv_group) if cv_group else None),
            "rmse_std": float(np.std(rmses, ddof=0)) if rmses else None,
            "r2_std": float(np.std(r2s, ddof=0)) if r2s else None,
        },
        "cv_folds": cv_folds,
        "train": {"rmse": _rmse(y, yhat_train), "r2": _r2(y, yhat_train)},
        "standardization": {"mean": st.mean, "std": st.std},
        "_model": final_model,
    }


def train_for_tag(records_csv: Path, tag: str, algo: str, k: int, seed: int, cv_group: str | None) -> dict:
    df = load_records(records_csv)

    if "profundidade_cm" in df.columns:
        if tag == "dados_010":
            df = df[df["profundidade_cm"].astype(str).str.strip() == "0-10"]
        if tag == "dados_1020":
            df = df[df["profundidade_cm"].astype(str).str.strip() == "10-20"]

    models: dict[str, dict] = {}
    for target in TARGETS_5:
        models[target] = train_one_target(df, target=target, algo=algo, k=k, seed=seed, cv_group=cv_group)

    return {"tag": tag, "features": REQUIRED_INPUTS_10, "targets": TARGETS_5, "models": models}


def main() -> None:
    ap = argparse.ArgumentParser(description="Treina modelos ensemble (offline) para o ISPC reduzido.")
    ap.add_argument("--data-dir", type=str, default=str(Path("data") / "ispc"), help="Diretório data/ispc")
    ap.add_argument("--tags", type=str, default="dados_010,dados_1020", help="Lista separada por vírgula")
    ap.add_argument("--algo", type=str, default="rf", help="Algoritmo: rf | gbr | xgb")
    ap.add_argument("--k", type=int, default=5, help="K-fold")
    ap.add_argument("--seed", type=int, default=42, help="Seed")
    ap.add_argument(
        "--cv-group",
        type=str,
        default="",
        help="Coluna para GroupKFold (ex: parcela, ano, cultura). Vazio = k-fold aleatório por linha.",
    )
    ap.add_argument(
        "--out",
        type=str,
        default=str(Path("data") / "ispc" / "ispc_reduced_ml_models_advanced.json"),
        help="Arquivo de saída JSON (metadata)",
    )
    ap.add_argument(
        "--models-dir",
        type=str,
        default=str(Path("data") / "ispc" / "models_advanced"),
        help="Diretório para salvar .pkl",
    )

    args = ap.parse_args()

    cv_group = str(args.cv_group).strip() or None
    if cv_group and cv_group not in META_COLS:
        raise SystemExit(f"--cv-group inválido. Use uma coluna meta: {', '.join(META_COLS)}")

    data_dir = Path(args.data_dir)
    tags = [t.strip() for t in str(args.tags).split(",") if t.strip()]

    models_dir = Path(args.models_dir)
    models_dir.mkdir(parents=True, exist_ok=True)

    out = {
        "kind": "ispc_reduced_advanced",
        "algo": str(args.algo).strip().lower(),
        "features": REQUIRED_INPUTS_10,
        "targets": TARGETS_5,
        "by_tag": {},
    }

    for tag in tags:
        records_csv = data_dir / f"ispc_records_{tag}.csv"
        if not records_csv.exists():
            raise SystemExit(f"Não achei {records_csv}")

        block = train_for_tag(records_csv, tag=tag, algo=args.algo, k=args.k, seed=args.seed, cv_group=cv_group)

        # Persistir modelos por target
        for target, info in block["models"].items():
            if not info.get("ok"):
                continue
            model = info.pop("_model")
            pkl_path = models_dir / f"{tag}__{args.algo}__{target}.pkl"
            with pkl_path.open("wb") as f:
                pickle.dump(model, f)
            info["model_path"] = str(pkl_path).replace("\\", "/")

        out["by_tag"][tag] = block

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: {out_path}")


if __name__ == "__main__":
    main()
