# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false, reportUnknownParameterType=false

"""Tuning automático de modelos para o ISPC reduzido.

Objetivo
Gerar um relatório reproduzível de qualidade em validação cruzada para múltiplos algoritmos e grades pequenas de hiperparâmetros, priorizando robustez e evitando vazamento por padronização fora do fold.

Uso típico
python tools/ispc_tune_reduced_ml_advanced.py --data-dir data/ispc --tags dados_010,dados_1020 --cv-group parcela

Saídas
- CSV com todos os candidatos avaliados
- JSON com o melhor candidato por profundidade e target

Observações
- Ridge usa StandardScaler por fold em um Pipeline
- Modelos de árvore não exigem padronização, mas o pipeline é mantido consistente
"""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

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
class SplitPlan:
    k_used: int
    splits: list[tuple[np.ndarray, np.ndarray]]


def _rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    err = y_pred - y_true
    return float(np.sqrt(np.mean(err * err)))


def _r2(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    ss_res = float(np.sum((y_true - y_pred) ** 2))
    ss_tot = float(np.sum((y_true - float(np.mean(y_true))) ** 2))
    if ss_tot == 0:
        return 1.0
    return 1.0 - (ss_res / ss_tot)


def _kfold_indices(n: int, k: int, seed: int) -> SplitPlan:
    rng = np.random.default_rng(seed)
    idx = np.arange(n)
    rng.shuffle(idx)

    used_k = int(min(int(k), int(n)))
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

    return SplitPlan(k_used=int(len(out)), splits=out)


def _group_kfold_indices(groups: np.ndarray, k: int, seed: int) -> SplitPlan:
    if groups.ndim != 1:
        raise ValueError("groups precisa ser 1D")

    g = groups.astype(str)
    uniq = np.unique(g)
    rng = np.random.default_rng(seed)
    rng.shuffle(uniq)

    used_k = int(min(int(k), int(len(uniq))))
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

    return SplitPlan(k_used=int(len(out)), splits=out)


def _to_numeric_frame(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    out = df.copy()
    for c in cols:
        out[c] = pd.to_numeric(out[c], errors="coerce")
    return out


def load_records(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    for c in META_COLS:
        if c not in df.columns:
            raise ValueError(f"CSV faltando coluna meta: {c}")
    df = _to_numeric_frame(df, REQUIRED_INPUTS_10 + TARGETS_5)
    return df


def _filter_by_tag(df: pd.DataFrame, tag: str) -> pd.DataFrame:
    if "profundidade_cm" not in df.columns:
        return df

    s = df["profundidade_cm"].astype(str).str.strip()
    if tag == "dados_010":
        return df[s == "0-10"]
    if tag == "dados_1020":
        return df[s == "10-20"]
    return df


def _candidate_grid(algos: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []

    if "ridge" in algos:
        for alpha in [0.0, 0.01, 0.1, 1.0, 10.0, 100.0]:
            out.append({"algo": "ridge", "alpha": float(alpha)})

    if "rf" in algos:
        for max_depth in [None, 3, 5, 8]:
            for min_samples_leaf in [1, 2, 4]:
                out.append(
                    {
                        "algo": "rf",
                        "n_estimators": 600,
                        "max_depth": max_depth,
                        "min_samples_leaf": int(min_samples_leaf),
                    }
                )

    if "gbr" in algos:
        for learning_rate in [0.03, 0.05, 0.08]:
            for n_estimators in [300, 600, 900]:
                for max_depth in [2, 3]:
                    out.append(
                        {
                            "algo": "gbr",
                            "learning_rate": float(learning_rate),
                            "n_estimators": int(n_estimators),
                            "max_depth": int(max_depth),
                        }
                    )

    return out


def _make_estimator(candidate: Mapping[str, Any], seed: int):
    algo = str(candidate.get("algo") or "").strip().lower()

    try:
        from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
        from sklearn.linear_model import Ridge
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler
    except Exception as exc:  # noqa: BLE001
        raise SystemExit("scikit-learn não está instalado. Instale com pip install scikit-learn") from exc

    if algo == "ridge":
        alpha = float(candidate.get("alpha") or 0.0)
        return Pipeline(
            steps=[
                ("scaler", StandardScaler(with_mean=True, with_std=True)),
                ("model", Ridge(alpha=alpha, fit_intercept=True)),
            ]
        )

    if algo == "rf":
        return RandomForestRegressor(
            n_estimators=int(candidate.get("n_estimators") or 600),
            random_state=int(seed),
            n_jobs=-1,
            max_depth=candidate.get("max_depth"),
            min_samples_leaf=int(candidate.get("min_samples_leaf") or 1),
        )

    if algo == "gbr":
        return GradientBoostingRegressor(
            random_state=int(seed),
            learning_rate=float(candidate.get("learning_rate") or 0.05),
            n_estimators=int(candidate.get("n_estimators") or 600),
            max_depth=int(candidate.get("max_depth") or 3),
        )

    raise SystemExit("algo inválido")


def _as_float(x: Any) -> float | None:
    try:
        return float(x)
    except Exception:  # noqa: BLE001
        return None


def evaluate_candidate(
    sub: pd.DataFrame,
    *,
    features: list[str],
    target: str,
    candidate: dict[str, Any],
    k: int,
    seed: int,
    cv_group: str | None,
) -> dict[str, Any]:
    cols = features + [target]
    if cv_group:
        cols.append(cv_group)

    d = sub[cols].dropna()
    n = int(d.shape[0])
    if n < max(20, k * 4):
        return {
            "ok": False,
            "reason": "not_enough_rows",
            "n": n,
        }

    X = d[features].to_numpy(dtype=float)
    y = d[target].to_numpy(dtype=float)

    if cv_group:
        plan = _group_kfold_indices(d[cv_group].to_numpy(), k=k, seed=seed)
        if plan.k_used < 2:
            return {
                "ok": False,
                "reason": "not_enough_groups",
                "n": n,
                "k_used": int(plan.k_used),
            }
    else:
        plan = _kfold_indices(n, k=k, seed=seed)
        if plan.k_used < 2:
            return {
                "ok": False,
                "reason": "not_enough_folds",
                "n": n,
                "k_used": int(plan.k_used),
            }

    rmses: list[float] = []
    r2s: list[float] = []

    for train_idx, test_idx in plan.splits:
        est = _make_estimator(candidate, seed=seed)
        est.fit(X[train_idx], y[train_idx])
        yhat_any = est.predict(X[test_idx])
        yhat = np.asarray(yhat_any, dtype=float)
        rmses.append(_rmse(y[test_idx], yhat))
        r2s.append(_r2(y[test_idx], yhat))

    return {
        "ok": True,
        "n": n,
        "k_used": int(plan.k_used),
        "rmse": float(np.mean(rmses)) if rmses else None,
        "rmse_std": float(np.std(rmses, ddof=0)) if rmses else None,
        "r2": float(np.mean(r2s)) if r2s else None,
        "r2_std": float(np.std(r2s, ddof=0)) if r2s else None,
    }


def choose_best(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    ok_rows = [r for r in rows if r.get("ok")]
    if not ok_rows:
        return None

    def key(r: dict[str, Any]) -> tuple[float, float, float, float]:
        rmse = _as_float(r.get("rmse"))
        r2 = _as_float(r.get("r2"))
        rmse_std = _as_float(r.get("rmse_std"))
        r2_std = _as_float(r.get("r2_std"))
        rmse = rmse if rmse is not None else 1e18
        r2 = r2 if r2 is not None else -1e18
        rmse_std = rmse_std if rmse_std is not None else 1e18
        r2_std = r2_std if r2_std is not None else 1e18
        return (rmse, -r2, rmse_std, r2_std)

    return sorted(ok_rows, key=key)[0]


def write_csv(rows: list[dict[str, Any]], out_csv: Path) -> None:
    out_csv.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = [
        "depth_tag",
        "target",
        "algo",
        "params",
        "ok",
        "reason",
        "n",
        "k_used",
        "cv_group",
        "rmse",
        "rmse_std",
        "r2",
        "r2_std",
    ]

    with out_csv.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";")
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in fieldnames})


def main() -> None:
    ap = argparse.ArgumentParser(description="Tuning automático para modelos reduzidos do ISPC")
    ap.add_argument("--data-dir", type=str, default=str(Path("data") / "ispc"), help="Diretório data/ispc")
    ap.add_argument("--tags", type=str, default="dados_010,dados_1020", help="Lista separada por vírgula")
    ap.add_argument("--algos", type=str, default="ridge,rf,gbr", help="Lista separada por vírgula")
    ap.add_argument("--k", type=int, default=5, help="K-fold")
    ap.add_argument("--seed", type=int, default=42, help="Seed")
    ap.add_argument(
        "--cv-group",
        type=str,
        default="",
        help="Coluna para GroupKFold, por exemplo parcela, ano, cultura. Vazio usa k-fold aleatório por linha",
    )
    ap.add_argument(
        "--out-csv",
        type=str,
        default=str(Path("data") / "ispc" / "ispc_reduced_ml_tuning_report.csv"),
        help="CSV de saída com todos os candidatos",
    )
    ap.add_argument(
        "--out-json",
        type=str,
        default=str(Path("data") / "ispc" / "ispc_reduced_ml_tuning_best.json"),
        help="JSON de saída com o melhor candidato por target",
    )

    args = ap.parse_args()

    data_dir = Path(args.data_dir)
    tags = [t.strip() for t in str(args.tags).split(",") if t.strip()]
    algos = [a.strip().lower() for a in str(args.algos).split(",") if a.strip()]

    cv_group = str(args.cv_group).strip() or None
    if cv_group and cv_group not in META_COLS:
        raise SystemExit("cv-group inválido")

    candidates = _candidate_grid(algos)
    if not candidates:
        raise SystemExit("Nenhum candidato gerado")

    all_rows: list[dict[str, Any]] = []
    best: dict[str, Any] = {
        "kind": "ispc_reduced_tuning",
        "k": int(args.k),
        "seed": int(args.seed),
        "cv_group": (str(cv_group) if cv_group else ""),
        "by_tag": {},
    }

    for tag in tags:
        records_csv = data_dir / f"ispc_records_{tag}.csv"
        if not records_csv.exists():
            raise SystemExit(f"Não achei {records_csv}")

        df = load_records(records_csv)
        df = _filter_by_tag(df, tag)

        best.setdefault("by_tag", {}).setdefault(tag, {})

        for target in TARGETS_5:
            per_target: list[dict[str, Any]] = []

            for cand in candidates:
                params = {k: v for k, v in cand.items() if k != "algo"}
                info = evaluate_candidate(
                    df,
                    features=REQUIRED_INPUTS_10,
                    target=target,
                    candidate=cand,
                    k=int(args.k),
                    seed=int(args.seed),
                    cv_group=cv_group,
                )

                row: dict[str, Any] = {
                    "depth_tag": str(tag),
                    "target": str(target),
                    "algo": str(cand.get("algo")),
                    "params": json.dumps(params, ensure_ascii=False, sort_keys=True),
                    "cv_group": (str(cv_group) if cv_group else ""),
                    **info,
                }

                per_target.append(row)
                all_rows.append(row)

            best_row = choose_best(per_target)
            best["by_tag"][tag][target] = best_row or {"ok": False, "reason": "no_ok_candidates"}

    out_csv = Path(str(args.out_csv))
    out_json = Path(str(args.out_json))

    write_csv(all_rows, out_csv)
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(best, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"OK: {out_csv}")
    print(f"OK: {out_json}")


if __name__ == "__main__":
    main()
