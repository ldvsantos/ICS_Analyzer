"""Gera alertas operacionais a partir do relatório de qualidade do modelo reduzido.

Objetivo
Traduzir métricas de validação cruzada em um artefato de decisão que pode ser consumido por automações simples, inclusive envio para um webhook.

Uso típico
python tools/ispc_model_quality_alerts.py --in-csv data/ispc/model_quality_report.csv --out-json data/ispc/model_quality_alerts.json

Regras
- Prioriza falhas e R² negativo como condição crítica
- Trata instabilidade por desvio padrão entre folds como alerta
"""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen


def _as_float(x: Any) -> float | None:
    try:
        return float(x)
    except Exception:  # noqa: BLE001
        return None


def _as_int(x: Any) -> int | None:
    try:
        v = int(float(x))
        return v
    except Exception:  # noqa: BLE001
        return None


@dataclass(frozen=True)
class Thresholds:
    min_n: int
    min_r2: float
    max_r2_std: float


def classify(row: dict[str, Any], th: Thresholds) -> tuple[str, list[str]]:
    flags: list[str] = []

    ok = str(row.get("ok") or "").strip().lower()
    if ok in {"false", "0", "nao", "não"}:
        flags.append("falha")

    n = _as_int(row.get("n"))
    if n is not None and n < th.min_n:
        flags.append("n_baixo")

    r2 = _as_float(row.get("r2"))
    if r2 is not None and r2 < th.min_r2:
        flags.append("r2_baixo")

    r2_std = _as_float(row.get("r2_std"))
    if r2_std is not None and r2_std > th.max_r2_std:
        flags.append("r2_instavel")

    if "falha" in flags or "r2_baixo" in flags:
        return "critico", flags

    if "r2_instavel" in flags or "n_baixo" in flags:
        return "alerta", flags

    return "ok", flags


def load_csv(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8", newline="") as f:
        r = csv.DictReader(f, delimiter=";")
        return [dict(row) for row in r]


def write_json(obj: Any, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_js_umd(*, obj: Any, path: Path, global_name: str) -> None:
    """Escreve um bundle JS simples para consumo em docs/.

    Formato UMD mínimo compatível com browser e CommonJS.
    """

    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    js = (
        "// Gerado automaticamente\n"
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
    path.write_text(js, encoding="utf-8")


def post_webhook(url: str, payload: dict[str, Any]) -> None:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(req, timeout=20) as resp:
        _ = resp.read()


def main() -> None:
    ap = argparse.ArgumentParser(description="Gera alertas a partir do relatório de qualidade do modelo reduzido")
    ap.add_argument(
        "--in-csv",
        type=str,
        default=str(Path("data") / "ispc" / "model_quality_report.csv"),
        help="Entrada do CSV do relatório de qualidade",
    )
    ap.add_argument(
        "--out-json",
        type=str,
        default=str(Path("data") / "ispc" / "model_quality_alerts.json"),
        help="Saída JSON de alertas",
    )
    ap.add_argument("--min-n", type=int, default=30)
    ap.add_argument("--min-r2", type=float, default=0.0)
    ap.add_argument("--max-r2-std", type=float, default=0.2)
    ap.add_argument("--webhook-url", type=str, default="")
    ap.add_argument(
        "--out-js",
        type=str,
        default="",
        help="Opcional. Saída JS (UMD) para consumo em docs/",
    )

    args = ap.parse_args()

    th = Thresholds(min_n=int(args.min_n), min_r2=float(args.min_r2), max_r2_std=float(args.max_r2_std))

    rows = load_csv(Path(args.in_csv))
    items: list[dict[str, Any]] = []

    counts = {"ok": 0, "alerta": 0, "critico": 0}

    for row in rows:
        severity, flags = classify(row, th)
        counts[severity] = int(counts.get(severity, 0)) + 1

        items.append(
            {
                "depth_tag": row.get("depth_tag"),
                "target": row.get("target"),
                "severity": severity,
                "flags": flags,
                "n": _as_int(row.get("n")),
                "k": _as_int(row.get("k")),
                "cv_group": row.get("cv_group"),
                "rmse": _as_float(row.get("rmse")),
                "rmse_std": _as_float(row.get("rmse_std")),
                "r2": _as_float(row.get("r2")),
                "r2_std": _as_float(row.get("r2_std")),
            }
        )

    out: dict[str, Any] = {
        "kind": "ispc_model_quality_alerts",
        "thresholds": {"min_n": th.min_n, "min_r2": th.min_r2, "max_r2_std": th.max_r2_std},
        "counts": counts,
        "items": sorted(items, key=lambda x: (x["severity"], str(x.get("depth_tag") or ""), str(x.get("target") or ""))),
    }

    out_path = Path(args.out_json)
    write_json(out, out_path)
    print(f"OK: {out_path}")

    out_js = str(args.out_js).strip()
    if out_js:
        js_path = Path(out_js).expanduser()
        write_js_umd(obj=out, path=js_path, global_name="ISPC_ModelQualityAlerts")
        print(f"OK: {js_path}")

    webhook_url = str(args.webhook_url).strip()
    if webhook_url:
        post_webhook(webhook_url, {"text": "ICS Analyzer model quality alerts", "data": out})
        print("OK: webhook")


if __name__ == "__main__":
    main()
