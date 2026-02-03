# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false, reportUnknownParameterType=false

"""Promove (de forma suave) o modelo ridge reduzido para uso em produção.

Motivação
O tuning avançado avalia múltiplos algoritmos (ridge/rf/gbr). Porém, o runtime do ICS Analyzer no navegador
usa um bundle de regressões ridge (coeficientes + padronização) para estimar as 5 variáveis intermediárias.

Este script lê o relatório de tuning (CSV) e escolhe, para cada profundidade e target, o melhor candidato RIDGE
com um critério "suave" que penaliza instabilidade (rmse_std), sem aplicar gates rígidos de R².
Em seguida, re-treina o ridge no conjunto completo (por profundidade/target) com o alpha escolhido e exporta:
- JSON em data/ispc
- Bundle UMD em docs/assets/js, consumível no dashboard e no módulo fuzzy

Importante
- Não substitui nem remove modelos. Se algum par (tag,target) não tiver ridge no relatório de tuning,
  o script faz fallback para o modelo base presente em data/ispc/ispc_reduced_ml_models.json.
- O bundle exportado usa um nome global diferente (ISPC_ReducedMLModelsProduction) e o runtime pode priorizá-lo.

Uso
python tools/ispc_promote_reduced_ml.py \
  --data-dir data/ispc \
  --tuning-csv data/ispc/ispc_reduced_ml_tuning_report.csv \
  --base-json data/ispc/ispc_reduced_ml_models.json \
  --out-json data/ispc/ispc_reduced_ml_models_production.json \
  --out-js docs/assets/js/ispc_reduced_ml_models_production.js
"""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

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


def load_records(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    for c in META_COLS:
        if c not in df.columns:
            raise ValueError(f"CSV faltando coluna meta: {c}")
    return _to_numeric_frame(df, REQUIRED_INPUTS_10 + TARGETS_5)


def load_records_for_tag(data_dir: Path, tag: str, explicit: Path | None) -> pd.DataFrame | None:
    """Carrega registros para uma tag.

    Ordem de preferência
    - Se explicit foi passado: usa explicit
    - Caso contrário, tenta data_dir/ispc_records_{tag}.csv
    - Por fim, tenta data_dir/ispc_records_mestre.csv

    Retorna None se nenhum arquivo válido com linhas existir.
    """

    candidates: list[Path] = []
    if explicit is not None:
        candidates.append(explicit)
    else:
        candidates.append(data_dir / f"ispc_records_{tag}.csv")
        candidates.append(data_dir / "ispc_records_mestre.csv")

    for p in candidates:
        if not p.exists():
            continue
        df = load_records(p)
        if df.shape[0] > 0:
            return df

    return None


def _filter_by_tag(df: pd.DataFrame, tag: str) -> pd.DataFrame:
    if "profundidade_cm" not in df.columns:
        return df

    s = df["profundidade_cm"].astype(str).str.strip()
    if tag == "dados_010":
        return df[s == "0-10"]
    if tag == "dados_1020":
        return df[s == "10-20"]
    return df


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
    """Fit ridge regression with intercept (not penalized)."""

    n = X.shape[0]
    ones = np.ones((n, 1), dtype=float)
    Xa = np.concatenate([ones, X], axis=1)

    XtX = Xa.T @ Xa
    reg = np.zeros_like(XtX)
    reg[1:, 1:] = np.eye(XtX.shape[0] - 1) * float(alpha)

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


def _read_base_models(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        obj = json.load(f)
    if not isinstance(obj, dict) or obj.get("kind") not in {"ispc_reduced_ridge", "ispc_reduced_ridge_production"}:
        raise ValueError("base-json não parece ser um bundle de modelos reduzidos ridge")
    return obj


def _parse_bool(x: Any) -> bool:
    if isinstance(x, bool):
        return x
    s = str(x).strip().lower()
    return s in {"1", "true", "t", "yes", "y", "sim"}


def _parse_float(x: Any) -> float | None:
    try:
        v = float(x)
    except Exception:  # noqa: BLE001
        return None
    if not np.isfinite(v):
        return None
    return float(v)


def _select_best_ridge_by_group(
    tuning_csv: Path,
    *,
    std_weight: float,
) -> dict[tuple[str, str], dict[str, Any]]:
    """Retorna (depth_tag,target) -> row do melhor ridge no tuning report."""

    best: dict[tuple[str, str], dict[str, Any]] = {}
    best_score: dict[tuple[str, str], float] = {}

    with tuning_csv.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            if not row:
                continue
            if str(row.get("algo") or "").strip().lower() != "ridge":
                continue
            if not _parse_bool(row.get("ok")):
                continue

            depth_tag = str(row.get("depth_tag") or "").strip()
            target = str(row.get("target") or "").strip()
            if not depth_tag or not target:
                continue

            rmse = _parse_float(row.get("rmse"))
            rmse_std = _parse_float(row.get("rmse_std"))
            if rmse is None:
                continue
            if rmse_std is None:
                rmse_std = 0.0

            # Critério suave: prioriza erro baixo e penaliza instabilidade.
            score = float(rmse + float(std_weight) * float(rmse_std))

            key = (depth_tag, target)
            if key not in best_score or score < best_score[key]:
                best_score[key] = score
                best[key] = row

    return best


def _extract_alpha(params_text: str) -> float | None:
    try:
        obj = json.loads(params_text)
    except Exception:  # noqa: BLE001
        return None

    if not isinstance(obj, dict):
        return None

    alpha = obj.get("alpha")
    v = _parse_float(alpha)
    if v is None:
        return None
    if v < 0:
        return 0.0
    return float(v)


def _write_js_umd(global_name: str, obj: dict[str, Any], out_js: Path) -> None:
    payload = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    text = (
        "// Modelos ML (ridge) para ISPC reduzido (production), gerado automaticamente\n"
        "(function (root, factory) {\n"
        "  if (typeof module === 'object' && module.exports) {\n"
        "    module.exports = factory();\n"
        "  } else {\n"
        f"    root.{global_name} = factory();\n"
        "  }\n"
        "})(typeof self !== 'undefined' ? self : this, function () {\n"
        f"  return {payload};\n"
        "});\n"
    )
    out_js.parent.mkdir(parents=True, exist_ok=True)
    out_js.write_text(text, encoding="utf-8")


def promote(
    *,
    data_dir: Path,
    records_csv: Path | None,
    base: dict[str, Any],
    best_ridge_rows: dict[tuple[str, str], dict[str, Any]],
    std_weight: float,
) -> dict[str, Any]:
    by_tag_out: dict[str, Any] = {}

    base_by_tag = base.get("by_tag") or {}
    tags = sorted(set(base_by_tag.keys()) | {t for (t, _) in best_ridge_rows.keys()})

    for tag in tags:
        base_tag = base_by_tag.get(tag) or {}
        features = list(base_tag.get("features") or base.get("features") or REQUIRED_INPUTS_10)
        targets = list(base_tag.get("targets") or base.get("targets") or TARGETS_5)

        df_loaded = load_records_for_tag(data_dir, str(tag), records_csv)
        if df_loaded is None:
            df_tag = pd.DataFrame(columns=features + targets)
        else:
            df_tag = _filter_by_tag(df_loaded, str(tag))

        models_out: dict[str, Any] = {}
        for target in targets:
            key = (tag, target)

            base_model = (base_tag.get("models") or {}).get(target)
            selected_row = best_ridge_rows.get(key)

            alpha = None
            if selected_row is not None:
                alpha = _extract_alpha(str(selected_row.get("params") or ""))

            if alpha is None and isinstance(base_model, dict) and _parse_bool(base_model.get("ok")):
                alpha = _parse_float(base_model.get("alpha"))

            if alpha is None:
                # Sem alpha confiável, devolve o modelo base (mesmo que falho) para não perder cobertura.
                if isinstance(base_model, dict):
                    models_out[target] = base_model
                else:
                    models_out[target] = {"ok": False, "reason": "missing_base_model"}
                continue

            cols = features + [target]
            sub = df_tag[cols].dropna()
            if sub.empty or sub.shape[0] < 10:
                # Fallback para base se não houver dados suficientes no recorte.
                if isinstance(base_model, dict):
                    models_out[target] = base_model
                else:
                    models_out[target] = {"ok": False, "reason": "not_enough_rows", "n": int(sub.shape[0])}
                continue

            X, st = _standardize(sub, features)
            y = sub[target].to_numpy(dtype=float)

            intercept, weights = _ridge_fit(X, y, alpha=float(alpha))
            yhat = _predict(X, intercept, weights)

            spec: dict[str, Any] = {
                "ok": True,
                "n": int(sub.shape[0]),
                "alpha": float(alpha),
                "train": {
                    "rmse": _rmse(y, yhat),
                    "r2": _r2(y, yhat),
                },
                "standardization": {
                    "mean": st.mean,
                    "std": st.std,
                },
                "intercept": float(intercept),
                "weights": {features[i]: float(weights[i]) for i in range(len(features))},
            }

            # Metadados de CV (do tuning report), quando disponíveis.
            if selected_row is not None:
                base_cv = base_model.get("cv") if isinstance(base_model, dict) else None
                base_seed = _parse_float(base_cv.get("seed")) if isinstance(base_cv, dict) else None
                spec["cv"] = {
                    "k": int(_parse_float(selected_row.get("k_used")) or _parse_float(selected_row.get("k")) or 0),
                    "seed": int(_parse_float(selected_row.get("seed")) or (base_seed or 0)),
                    "group": str(selected_row.get("cv_group") or "").strip() or None,
                    "rmse": _parse_float(selected_row.get("rmse")),
                    "rmse_std": _parse_float(selected_row.get("rmse_std")),
                    "r2": _parse_float(selected_row.get("r2")),
                    "r2_std": _parse_float(selected_row.get("r2_std")),
                    "promotion_score": float(
                        float(_parse_float(selected_row.get("rmse")) or 0.0)
                        + float(std_weight) * float(_parse_float(selected_row.get("rmse_std")) or 0.0)
                    ),
                }

            models_out[target] = spec

        by_tag_out[tag] = {
            "tag": tag,
            "features": features,
            "targets": targets,
            "models": models_out,
        }

    return {
        "kind": "ispc_reduced_ridge_production",
        "features": list(base.get("features") or REQUIRED_INPUTS_10),
        "targets": list(base.get("targets") or TARGETS_5),
        "promotion": {
            "policy": "soft_ridge_from_tuning_report",
            "std_weight": float(std_weight),
        },
        "by_tag": by_tag_out,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default="data/ispc", help="Diretório base com CSVs do ISPC")
    ap.add_argument(
        "--records-csv",
        default="",
        help="CSV mestre de registros (default: data-dir/ispc_records_mestre.csv)",
    )
    ap.add_argument(
        "--tuning-csv",
        default="data/ispc/ispc_reduced_ml_tuning_report.csv",
        help="CSV do tuning (saída do ispc_tune_reduced_ml_advanced.py)",
    )
    ap.add_argument(
        "--base-json",
        default="data/ispc/ispc_reduced_ml_models.json",
        help="JSON base ridge (fallback por target/tag)",
    )
    ap.add_argument(
        "--std-weight",
        type=float,
        default=0.5,
        help="Peso de penalização da instabilidade rmse_std no critério suave",
    )
    ap.add_argument(
        "--out-json",
        default="data/ispc/ispc_reduced_ml_models_production.json",
        help="Caminho do JSON de saída",
    )
    ap.add_argument(
        "--out-js",
        default="docs/assets/js/ispc_reduced_ml_models_production.js",
        help="Caminho do bundle JS UMD de saída",
    )
    ap.add_argument(
        "--global-name",
        default="ISPC_ReducedMLModelsProduction",
        help="Nome global do objeto no bundle JS",
    )
    args = ap.parse_args()

    data_dir = Path(args.data_dir)
    records_csv = Path(args.records_csv) if str(args.records_csv).strip() else None
    tuning_csv = Path(args.tuning_csv)
    base_json = Path(args.base_json)

    out_json = Path(args.out_json)
    out_js = Path(args.out_js)

    base = _read_base_models(base_json)
    best_ridge = _select_best_ridge_by_group(tuning_csv, std_weight=float(args.std_weight))

    prod = promote(
        data_dir=data_dir,
        records_csv=records_csv,
        base=base,
        best_ridge_rows=best_ridge,
        std_weight=float(args.std_weight),
    )

    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(prod, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    _write_js_umd(str(args.global_name), prod, out_js)


if __name__ == "__main__":
    main()
