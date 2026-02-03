"""Relatório de qualidade para modelos reduzidos (ISPC).

Uso típico
  python tools/ispc_model_quality_report.py --models data/ispc/ispc_reduced_ml_models.json

Opcional
  python tools/ispc_model_quality_report.py --models data/ispc/ispc_reduced_ml_models.json --out-csv data/ispc/model_quality_report.csv

Objetivo
- Resumir métricas de validação cruzada e treino por profundidade e target.
- Sinalizar instabilidade por variabilidade entre folds e/ou amostra pequena.

Observação metodológica
- Os modelos ridge do ISPC reduzido padronizam por fold na CV quando gerados por tools/ispc_train_reduced_ml.py.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any, Mapping, cast


def _as_dict(x: Any) -> dict[str, Any]:
    if not isinstance(x, dict):
        return {}
    d = cast(dict[Any, Any], x)
    return {str(k): v for k, v in d.items()}


def _as_float(x: Any) -> float | None:
    try:
        v = float(x)
        return v
    except Exception:  # noqa: BLE001
        return None


def _fmt(v: float | None, digits: int = 4) -> str:
    if v is None:
        return "—"
    return f"{v:.{digits}f}"


def _flag_row(
    row: Mapping[str, Any],
    *,
    min_n: int,
    max_rmse_cv: float | None,
    min_r2_cv: float | None,
    max_rmse_std: float | None,
    max_r2_std: float | None,
) -> str:
    flags: list[str] = []

    n = row.get("n")
    if isinstance(n, int) and n < min_n:
        flags.append(f"n<{min_n}")

    rmse = row.get("rmse")
    r2 = row.get("r2")
    rmse_std = row.get("rmse_std")
    r2_std = row.get("r2_std")

    if (max_rmse_cv is not None) and (isinstance(rmse, float)) and (rmse > max_rmse_cv):
        flags.append("rmse_alto")

    if (min_r2_cv is not None) and (isinstance(r2, float)) and (r2 < min_r2_cv):
        flags.append("r2_baixo")

    if (max_rmse_std is not None) and (isinstance(rmse_std, float)) and (rmse_std > max_rmse_std):
        flags.append("rmse_instavel")

    if (max_r2_std is not None) and (isinstance(r2_std, float)) and (r2_std > max_r2_std):
        flags.append("r2_instavel")

    return ",".join(flags)


def load_rows(models_path: Path) -> list[dict[str, Any]]:
    data_any = json.loads(models_path.read_text(encoding="utf-8"))
    data = _as_dict(data_any)

    by_tag = _as_dict(data.get("by_tag"))
    out: list[dict[str, Any]] = []

    for tag, block_any in sorted(by_tag.items()):
        block = _as_dict(block_any)
        models = _as_dict(block.get("models"))
        for target, model_any in sorted(models.items()):
            m = _as_dict(model_any)
            cv = _as_dict(m.get("cv"))
            train = _as_dict(m.get("train"))

            out.append(
                {
                    "depth_tag": str(tag),
                    "target": str(target),
                    "ok": bool(m.get("ok")),
                    "reason": str(m.get("reason") or ""),
                    "n": int(m["n"]) if isinstance(m.get("n"), int) else None,
                    "alpha": _as_float(m.get("alpha")),
                    "k": int(cv["k"]) if isinstance(cv.get("k"), int) else None,
                    "cv_group": str(cv.get("group") or ""),
                    "rmse": _as_float(cv.get("rmse")),
                    "rmse_std": _as_float(cv.get("rmse_std")),
                    "r2": _as_float(cv.get("r2")),
                    "r2_std": _as_float(cv.get("r2_std")),
                    "train_rmse": _as_float(train.get("rmse")),
                    "train_r2": _as_float(train.get("r2")),
                }
            )

    return out


def print_report(
    rows: list[dict[str, Any]],
    *,
    min_n: int,
    max_rmse_cv: float | None,
    min_r2_cv: float | None,
    max_rmse_std: float | None,
    max_r2_std: float | None,
) -> None:
    if not rows:
        print("Sem linhas para relatar.")
        return

    for r in rows:
        r["flags"] = _flag_row(
            r,
            min_n=min_n,
            max_rmse_cv=max_rmse_cv,
            min_r2_cv=min_r2_cv,
            max_rmse_std=max_rmse_std,
            max_r2_std=max_r2_std,
        )

    # Ordenação para triagem de risco
    def risk_key(rr: Mapping[str, Any]) -> tuple[int, float, float]:
        ok = 0 if rr.get("ok") else 1
        r2 = rr.get("r2")
        r2 = r2 if isinstance(r2, float) else -999.0
        r2_std = rr.get("r2_std")
        r2_std = r2_std if isinstance(r2_std, float) else 0.0
        return (ok, r2, -r2_std)

    rows_sorted = sorted(rows, key=risk_key)

    print("Relatório de qualidade do modelo reduzido (ISPC)")
    print("Formato: tag | target | n | k | grupo | rmse±sd | r2±sd | alpha | flags")

    for r in rows_sorted:
        rmse_txt = _fmt(r.get("rmse"), 4)
        rmse_sd_txt = _fmt(r.get("rmse_std"), 4) if r.get("rmse_std") is not None else ""
        r2_txt = _fmt(r.get("r2"), 4)
        r2_sd_txt = _fmt(r.get("r2_std"), 4) if r.get("r2_std") is not None else ""

        rmse_join = rmse_txt + (f"±{rmse_sd_txt}" if rmse_sd_txt else "")
        r2_join = r2_txt + (f"±{r2_sd_txt}" if r2_sd_txt else "")

        print(
            f"{r.get('depth_tag')} | {r.get('target')} | {r.get('n') or '—'} | {r.get('k') or '—'} | {r.get('cv_group') or '—'} | "
            f"{rmse_join} | {r2_join} | {_fmt(r.get('alpha'), 4)} | {r.get('flags') or ''}"
        )


def write_csv(rows: list[dict[str, Any]], out_csv: Path) -> None:
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "depth_tag",
        "target",
        "ok",
        "reason",
        "n",
        "alpha",
        "k",
        "cv_group",
        "rmse",
        "rmse_std",
        "r2",
        "r2_std",
        "train_rmse",
        "train_r2",
        "flags",
    ]

    with out_csv.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";")
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in fieldnames})


def main() -> None:
    ap = argparse.ArgumentParser(description="Gera relatório de qualidade para modelos reduzidos (ISPC).")
    ap.add_argument(
        "--models",
        type=str,
        default=str(Path("data") / "ispc" / "ispc_reduced_ml_models.json"),
        help="Caminho para o JSON de modelos ridge reduzidos",
    )
    ap.add_argument("--out-csv", type=str, default="", help="Opcional, caminho do CSV de saída")

    ap.add_argument("--min-n", type=int, default=30, help="Sinaliza quando n < min-n")
    ap.add_argument("--max-rmse-cv", type=float, default=-1, help="Sinaliza quando RMSE(CV) > limite (use -1 para desativar)")
    ap.add_argument("--min-r2-cv", type=float, default=-1, help="Sinaliza quando R2(CV) < limite (use -1 para desativar)")
    ap.add_argument("--max-rmse-std", type=float, default=-1, help="Sinaliza quando RMSE std entre folds > limite (use -1 para desativar)")
    ap.add_argument("--max-r2-std", type=float, default=-1, help="Sinaliza quando R2 std entre folds > limite (use -1 para desativar)")

    args = ap.parse_args()

    models_path = Path(args.models)
    rows = load_rows(models_path)

    max_rmse_cv = None if args.max_rmse_cv < 0 else float(args.max_rmse_cv)
    min_r2_cv = None if args.min_r2_cv < 0 else float(args.min_r2_cv)
    max_rmse_std = None if args.max_rmse_std < 0 else float(args.max_rmse_std)
    max_r2_std = None if args.max_r2_std < 0 else float(args.max_r2_std)

    print_report(
        rows,
        min_n=int(args.min_n),
        max_rmse_cv=max_rmse_cv,
        min_r2_cv=min_r2_cv,
        max_rmse_std=max_rmse_std,
        max_r2_std=max_r2_std,
    )

    out_csv = str(args.out_csv).strip()
    if out_csv:
        for r in rows:
            if "flags" not in r:
                r["flags"] = ""
        write_csv(rows, Path(out_csv))
        print(f"OK: {out_csv}")


if __name__ == "__main__":
    main()
