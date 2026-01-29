import argparse
import json
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


def _ridge_fit(X: np.ndarray, y: np.ndarray, alpha: float) -> tuple[float, np.ndarray]:
    """Fit ridge regression with intercept (not penalized).

    X is standardized features.
    """
    n = X.shape[0]
    ones = np.ones((n, 1), dtype=float)
    Xa = np.concatenate([ones, X], axis=1)

    XtX = Xa.T @ Xa
    reg = np.zeros_like(XtX)
    reg[1:, 1:] = np.eye(XtX.shape[0] - 1) * alpha

    w = np.linalg.solve(XtX + reg, Xa.T @ y)
    intercept = float(w[0])
    weights = w[1:].astype(float)
    return intercept, weights


def _predict(X: np.ndarray, intercept: float, weights: np.ndarray) -> np.ndarray:
    return intercept + X @ weights


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


def train_one_target(
    df: pd.DataFrame,
    features: list[str],
    target: str,
    alphas: list[float],
    k: int,
    seed: int,
) -> dict:
    sub = df[features + [target]].dropna()
    if sub.empty or sub.shape[0] < max(10, k * 2):
        return {
            "ok": False,
            "reason": "not_enough_rows",
            "n": int(sub.shape[0]),
        }

    X, st = _standardize(sub, features)
    y = sub[target].to_numpy(dtype=float)

    splits = _kfold_indices(X.shape[0], k=k, seed=seed)

    best = None
    for alpha in alphas:
        rmses = []
        r2s = []
        for train_idx, test_idx in splits:
            intercept, weights = _ridge_fit(X[train_idx], y[train_idx], alpha=alpha)
            yhat = _predict(X[test_idx], intercept, weights)
            rmses.append(_rmse(y[test_idx], yhat))
            r2s.append(_r2(y[test_idx], yhat))
        mean_rmse = float(np.mean(rmses))
        mean_r2 = float(np.mean(r2s))
        cand = (mean_rmse, -mean_r2, alpha)
        if best is None or cand < best[0]:
            best = (cand, mean_rmse, mean_r2)

    assert best is not None
    _, best_rmse, best_r2 = best
    best_alpha = float(best[0][2])

    intercept, weights = _ridge_fit(X, y, alpha=best_alpha)
    yhat_train = _predict(X, intercept, weights)

    model = {
        "ok": True,
        "n": int(X.shape[0]),
        "alpha": best_alpha,
        "cv": {"k": int(k), "seed": int(seed), "rmse": best_rmse, "r2": best_r2},
        "train": {"rmse": _rmse(y, yhat_train), "r2": _r2(y, yhat_train)},
        "standardization": {"mean": st.mean, "std": st.std},
        "intercept": intercept,
        "weights": {features[i]: float(weights[i]) for i in range(len(features))},
    }

    return model


def load_records(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)

    for c in META_COLS:
        if c not in df.columns:
            raise ValueError(f"CSV faltando coluna meta: {c}")

    df = _to_numeric_frame(df, REQUIRED_INPUTS_10 + TARGETS_5)
    return df


def train_for_tag(records_csv: Path, tag: str, alphas: list[float], k: int, seed: int) -> dict:
    df = load_records(records_csv)

    # manter somente linhas com a profundidade esperada quando disponível
    if "profundidade_cm" in df.columns:
        if tag == "dados_010":
            df = df[df["profundidade_cm"].astype(str).str.strip() == "0-10"]
        if tag == "dados_1020":
            df = df[df["profundidade_cm"].astype(str).str.strip() == "10-20"]

    models = {}
    for target in TARGETS_5:
        models[target] = train_one_target(
            df,
            features=REQUIRED_INPUTS_10,
            target=target,
            alphas=alphas,
            k=k,
            seed=seed,
        )

    return {
        "tag": tag,
        "features": REQUIRED_INPUTS_10,
        "targets": TARGETS_5,
        "models": models,
    }


def main() -> None:
    ap = argparse.ArgumentParser(
        description=(
            "Treina modelos ridge multivariados para estimar as 5 variaveis do modo reduzido (a partir das 10 medidas)."
        )
    )
    ap.add_argument("--data-dir", type=str, default=str(Path("data") / "ispc"), help="Diretorio data/ispc")
    ap.add_argument("--tags", type=str, default="dados_010,dados_1020", help="Lista separada por virgula")
    ap.add_argument("--alphas", type=str, default="0,0.01,0.1,1,10", help="Grid de alpha")
    ap.add_argument("--k", type=int, default=5, help="K-fold")
    ap.add_argument("--seed", type=int, default=42, help="Seed")
    ap.add_argument(
        "--out",
        type=str,
        default=str(Path("data") / "ispc" / "ispc_reduced_ml_models.json"),
        help="Arquivo de saida JSON",
    )
    ap.add_argument(
        "--out-js",
        type=str,
        default=None,
        help="Arquivo de saida JS (UMD) para carregar no navegador",
    )

    args = ap.parse_args()

    data_dir = Path(args.data_dir)
    tags = [t.strip() for t in str(args.tags).split(",") if t.strip()]
    alphas = [float(a.strip()) for a in str(args.alphas).split(",") if a.strip()]

    out = {
        "kind": "ispc_reduced_ridge",
        "features": REQUIRED_INPUTS_10,
        "targets": TARGETS_5,
        "by_tag": {},
    }

    for tag in tags:
        records_csv = data_dir / f"ispc_records_{tag}.csv"
        if not records_csv.exists():
            raise SystemExit(f"Nao achei {records_csv}")
        out["by_tag"][tag] = train_for_tag(records_csv, tag=tag, alphas=alphas, k=args.k, seed=args.seed)

        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_json = json.dumps(out, ensure_ascii=False, indent=2)
        out_path.write_text(out_json, encoding="utf8")

        if args.out_js:
            js_path = Path(str(args.out_js))
            js_path.parent.mkdir(parents=True, exist_ok=True)
            payload = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
            js = (
                "// Modelos ML (ridge) para ISPC reduzido, gerado automaticamente\n"
                "(function (root, factory) {\n"
                "  if (typeof module === 'object' && module.exports) {\n"
                "    module.exports = factory();\n"
                "  } else {\n"
                "    root.ISPC_ReducedMLModels = factory();\n"
                "  }\n"
                "})(typeof self !== 'undefined' ? self : this, function () {\n"
                f"  return {payload};\n"
                "});\n"
            )
            js_path.write_text(js, encoding="utf8")

        print(json.dumps({"ok": True, "out": str(out_path), "outJs": args.out_js}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
