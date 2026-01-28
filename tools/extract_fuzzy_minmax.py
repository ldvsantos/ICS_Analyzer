from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extrai min/max/contagem de colunas do dataset para replicar a normalização do modelo fuzzy (ISPC)."
    )
    parser.add_argument(
        "--xlsx",
        required=True,
        help="Caminho para o arquivo .xlsx com a aba usada no pipeline fuzzy (ex: banco_dados.xlsx).",
    )
    parser.add_argument(
        "--sheet",
        default="dados_010",
        help="Nome da aba (default: dados_010).",
    )
    args = parser.parse_args()

    xlsx = Path(args.xlsx)
    sheet = str(args.sheet)

    if not xlsx.exists():
        raise SystemExit(
            f"Arquivo não encontrado: {xlsx}. Use --xlsx com o caminho completo/relativo do banco_dados.xlsx"
        )

    df = pd.read_excel(xlsx, sheet_name=sheet)

    cols = [
        "DMG",
        "DMP",
        "RMP",
        "Densidade",
        "Estoque de C",
        "Na",
        "ICV(%)",
        "Altura de Plantas",
        "Diâmetro espiga",
        "Comprimento espiga",
        "Número de plantas_ha",
        "N total de espigas_ha",
        "N de espigas comerciais_ha",
        "Peso de espigas comerciais_ha",
        "Produtividade",
    ]

    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise SystemExit(f"Missing columns in {sheet}: {missing}")

    out: dict[str, dict[str, float | int]] = {}
    for c in cols:
        s = pd.to_numeric(df[c], errors="coerce")
        out[c] = {
            "min": float(s.min(skipna=True)),
            "max": float(s.max(skipna=True)),
            "count": int(s.notna().sum()),
        }

    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
