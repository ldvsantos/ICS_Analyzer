# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false, reportUnknownParameterType=false

"""Atualiza artefatos que alimentam o dashboard e o runtime do ISPC reduzido.

Este script encadeia, em ordem segura, as etapas que geram os artefatos consumidos por docs/.
A intenção é reduzir o atrito operacional, mantendo o processo reproduzível.

Pipeline
- Tuning avançado (gera report + best + bundle JS)
- Promoção suave para ridge em produção (gera JSON + bundle JS)
- Relatório de qualidade baseado no bundle de produção (gera CSV)
- Alertas baseados no relatório de qualidade (gera JSON + bundle JS)

Obs.
- Não aplica gates rígidos. Se algo falhar para um par (tag,target), o runtime mantém fallback.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def run(cmd: list[str], cwd: Path) -> None:
    p = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True)
    if p.stdout:
        print(p.stdout.strip())
    if p.returncode != 0:
        if p.stderr:
            print(p.stderr.strip(), file=sys.stderr)
        raise SystemExit(p.returncode)


def main() -> None:
    ap = argparse.ArgumentParser(description="Atualiza tuning, promoção, qualidade e alertas do ISPC reduzido")
    ap.add_argument("--repo", type=str, default=".", help="Raiz do repositório (onde estão tools/, data/, docs/)")
    ap.add_argument("--tags", type=str, default="dados_010,dados_1020")
    ap.add_argument("--k", type=int, default=3)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--cv-group", type=str, default="parcela")
    ap.add_argument("--std-weight", type=float, default=0.5)
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    tools = repo / "tools"
    data_dir = repo / "data" / "ispc"
    docs_js = repo / "docs" / "assets" / "js"

    tuning_csv = data_dir / "ispc_reduced_ml_tuning_report.csv"
    tuning_best_json = data_dir / "ispc_reduced_ml_tuning_best.json"
    tuning_best_js = docs_js / "ispc_reduced_ml_tuning_best.js"

    prod_models_json = data_dir / "ispc_reduced_ml_models_production.json"
    prod_models_js = docs_js / "ispc_reduced_ml_models_production.js"

    quality_csv = data_dir / "model_quality_report.csv"
    alerts_json = data_dir / "model_quality_alerts.json"
    alerts_js = docs_js / "ispc_model_quality_alerts.js"

    # 1) Tuning
    run(
        [
            sys.executable,
            str(tools / "ispc_tune_reduced_ml_advanced.py"),
            "--data-dir",
            str(data_dir),
            "--tags",
            str(args.tags),
            "--k",
            str(int(args.k)),
            "--seed",
            str(int(args.seed)),
            "--cv-group",
            str(args.cv_group),
            "--out-csv",
            str(tuning_csv),
            "--out-json",
            str(tuning_best_json),
            "--out-js",
            str(tuning_best_js),
        ],
        cwd=repo,
    )

    # 2) Promoção ridge (produção)
    run(
        [
            sys.executable,
            str(tools / "ispc_promote_reduced_ml.py"),
            "--data-dir",
            str(data_dir),
            "--tuning-csv",
            str(tuning_csv),
            "--base-json",
            str(data_dir / "ispc_reduced_ml_models.json"),
            "--std-weight",
            str(float(args.std_weight)),
            "--out-json",
            str(prod_models_json),
            "--out-js",
            str(prod_models_js),
        ],
        cwd=repo,
    )

    # 3) Qualidade (a partir do bundle de produção)
    run(
        [
            sys.executable,
            str(tools / "ispc_model_quality_report.py"),
            "--models",
            str(prod_models_json),
            "--out-csv",
            str(quality_csv),
        ],
        cwd=repo,
    )

    # 4) Alertas
    run(
        [
            sys.executable,
            str(tools / "ispc_model_quality_alerts.py"),
            "--in-csv",
            str(quality_csv),
            "--out-json",
            str(alerts_json),
            "--out-js",
            str(alerts_js),
        ],
        cwd=repo,
    )

    print(f"OK: {tuning_csv}")
    print(f"OK: {tuning_best_json}")
    print(f"OK: {tuning_best_js}")
    print(f"OK: {prod_models_json}")
    print(f"OK: {prod_models_js}")
    print(f"OK: {quality_csv}")
    print(f"OK: {alerts_json}")
    print(f"OK: {alerts_js}")


if __name__ == "__main__":
    main()
