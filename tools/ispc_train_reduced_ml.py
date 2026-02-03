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


def _group_kfold_indices(groups: np.ndarray, k: int, seed: int) -> list[tuple[np.ndarray, np.ndarray]]:
    """K-fold por grupos (evita vazamento entre linhas do mesmo grupo)."""
    if groups.ndim != 1:
        raise ValueError("groups precisa ser 1D")

    # normalizar para string para evitar comparações estranhas (ex: números vs strings)
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


def train_one_target(
    df: pd.DataFrame,
    features: list[str],
    target: str,
    alphas: list[float],
    k: int,
    seed: int,
    cv_group: str | None,
) -> dict:
    cols = features + [target]
    if cv_group:
        cols.append(cv_group)

    sub = df[cols].dropna()
    if sub.empty or sub.shape[0] < max(10, k * 2):
        return {
            "ok": False,
            "reason": "not_enough_rows",
            "n": int(sub.shape[0]),
        }

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
        st_fold = _fit_standardization(train_df, features)
        X_train = _apply_standardization(train_df, features, st_fold)
        X_test = _apply_standardization(test_df, features, st_fold)
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

    best = None
    for alpha in alphas:
        rmses = []
        r2s = []
        for X_train, y_train, X_test, y_test, _, _ in fold_data:
            intercept, weights = _ridge_fit(X_train, y_train, alpha=alpha)
            yhat = _predict(X_test, intercept, weights)
            rmses.append(_rmse(y_test, yhat))
            r2s.append(_r2(y_test, yhat))
        mean_rmse = float(np.mean(rmses))
        mean_r2 = float(np.mean(r2s))
        cand = (mean_rmse, -mean_r2, alpha)
        if best is None or cand < best[0]:
            best = (cand, mean_rmse, mean_r2)

    assert best is not None
    _, best_rmse, best_r2 = best
    best_alpha = float(best[0][2])

    cv_folds = []
    for X_train, y_train, X_test, y_test, n_train, n_test in fold_data:
        intercept, weights = _ridge_fit(X_train, y_train, alpha=best_alpha)
        yhat = _predict(X_test, intercept, weights)
        cv_folds.append(
            {
                "n_train": int(n_train),
                "n_test": int(n_test),
                "rmse": _rmse(y_test, yhat),
                "r2": _r2(y_test, yhat),
            }
        )

    # Treino final em todo o conjunto (padronização global para inferência)
    X_all, st = _standardize(sub, features)
    intercept, weights = _ridge_fit(X_all, y, alpha=best_alpha)
    yhat_train = _predict(X_all, intercept, weights)

    model = {
        "ok": True,
        "n": int(X_all.shape[0]),
        "alpha": best_alpha,
        "cv": {
            "k": int(used_k),
            "seed": int(seed),
            "rmse": best_rmse,
            "r2": best_r2,
            "group": (str(cv_group) if cv_group else None),
            "rmse_std": float(np.std([f["rmse"] for f in cv_folds], ddof=0)) if cv_folds else None,
            "r2_std": float(np.std([f["r2"] for f in cv_folds], ddof=0)) if cv_folds else None,
        },
        "cv_folds": cv_folds,
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


def train_for_tag(
    records_csv: Path,
    tag: str,
    alphas: list[float],
    k: int,
    seed: int,
    cv_group: str | None,
) -> dict:
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
            cv_group=cv_group,
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
        "--cv-group",
        type=str,
        default="",
        help="Coluna para GroupKFold (ex: parcela, ano, cultura). Vazio = k-fold aleatório por linha.",
    )
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
    cv_group = str(args.cv_group).strip() or None

    if cv_group and cv_group not in META_COLS:
        raise SystemExit(f"--cv-group inválido. Use uma coluna meta: {', '.join(META_COLS)}")

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
        out["by_tag"][tag] = train_for_tag(
            records_csv,
            tag=tag,
            alphas=alphas,
            k=args.k,
            seed=args.seed,
            cv_group=cv_group,
        )

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
