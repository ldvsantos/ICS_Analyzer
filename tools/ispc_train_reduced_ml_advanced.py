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


def train_one_target(df: pd.DataFrame, target: str, algo: str, k: int, seed: int) -> dict:
    sub = df[REQUIRED_INPUTS_10 + [target]].dropna()
    if sub.empty or sub.shape[0] < max(20, k * 4):
        return {"ok": False, "reason": "not_enough_rows", "n": int(sub.shape[0])}

    X, st = _standardize(sub, REQUIRED_INPUTS_10)
    y = sub[target].to_numpy(dtype=float)

    splits = _kfold_indices(X.shape[0], k=k, seed=seed)

    rmses = []
    r2s = []
    for train_idx, test_idx in splits:
        model = _make_model(algo, seed=seed)
        model.fit(X[train_idx], y[train_idx])
        yhat = model.predict(X[test_idx])
        rmses.append(_rmse(y[test_idx], yhat))
        r2s.append(_r2(y[test_idx], yhat))

    # treinar final em tudo
    final_model = _make_model(algo, seed=seed)
    final_model.fit(X, y)
    yhat_train = final_model.predict(X)

    return {
        "ok": True,
        "n": int(X.shape[0]),
        "algo": algo,
        "cv": {"k": int(k), "seed": int(seed), "rmse": float(np.mean(rmses)), "r2": float(np.mean(r2s))},
        "train": {"rmse": _rmse(y, yhat_train), "r2": _r2(y, yhat_train)},
        "standardization": {"mean": st.mean, "std": st.std},
        "_model": final_model,
    }


def train_for_tag(records_csv: Path, tag: str, algo: str, k: int, seed: int) -> dict:
    df = load_records(records_csv)

    if "profundidade_cm" in df.columns:
        if tag == "dados_010":
            df = df[df["profundidade_cm"].astype(str).str.strip() == "0-10"]
        if tag == "dados_1020":
            df = df[df["profundidade_cm"].astype(str).str.strip() == "10-20"]

    models: dict[str, dict] = {}
    for target in TARGETS_5:
        models[target] = train_one_target(df, target=target, algo=algo, k=k, seed=seed)

    return {"tag": tag, "features": REQUIRED_INPUTS_10, "targets": TARGETS_5, "models": models}


def main() -> None:
    ap = argparse.ArgumentParser(description="Treina modelos ensemble (offline) para o ISPC reduzido.")
    ap.add_argument("--data-dir", type=str, default=str(Path("data") / "ispc"), help="Diretório data/ispc")
    ap.add_argument("--tags", type=str, default="dados_010,dados_1020", help="Lista separada por vírgula")
    ap.add_argument("--algo", type=str, default="rf", help="Algoritmo: rf | gbr | xgb")
    ap.add_argument("--k", type=int, default=5, help="K-fold")
    ap.add_argument("--seed", type=int, default=42, help="Seed")
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

        block = train_for_tag(records_csv, tag=tag, algo=args.algo, k=args.k, seed=args.seed)

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
