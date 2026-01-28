import argparse
import csv
import json
import math
from dataclasses import dataclass
from pathlib import Path

import pandas as pd


@dataclass(frozen=True)
class ColumnSpec:
    raw: str
    key: str


ISPC_COLS = [
    ColumnSpec("Parcela", "parcela"),
    ColumnSpec("Cultura", "cultura"),
    ColumnSpec("DMG", "dmg"),
    ColumnSpec("DMP", "dmp"),
    ColumnSpec("RMP", "rmp"),
    ColumnSpec("Densidade", "densidade"),
    ColumnSpec("Estoque de C", "estoque_c"),
    ColumnSpec("Na", "na"),
    ColumnSpec("ICV(%)", "icv"),
    ColumnSpec("Altura de Plantas", "altura"),
    ColumnSpec("Diâmetro espiga", "diam_espiga"),
    ColumnSpec("Comprimento espiga", "comp_espiga"),
    ColumnSpec("Número de plantas_ha", "n_plantas"),
    ColumnSpec("N total de espigas_ha", "n_espigas"),
    ColumnSpec("N de espigas comerciais_ha", "n_espigas_com"),
    ColumnSpec("Peso de espigas comerciais_ha", "peso_espigas"),
    ColumnSpec("Produtividade", "produtividade"),
]


ISPC_FEATURE_KEYS = [
    "dmg",
    "dmp",
    "rmp",
    "densidade",
    "estoque_c",
    "na",
    "icv",
    "altura",
    "diam_espiga",
    "comp_espiga",
    "n_plantas",
    "n_espigas",
    "n_espigas_com",
    "peso_espigas",
    "produtividade",
]


def parse_depth_from_sheet(sheet: str) -> str | None:
    # Convenção do arquivo atual: dados_010 e dados_1020 representam profundidades
    if sheet == "dados_010":
        return "0-10"
    if sheet == "dados_1020":
        return "10-20"
    return None


def load_excel_sheet(path: Path, sheet: str) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name=sheet)
    return df


def load_csv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    return df


def standardize_from_excel(df: pd.DataFrame) -> pd.DataFrame:
    missing = [c.raw for c in ISPC_COLS if c.raw not in df.columns]
    if missing:
        raise ValueError(f"Colunas ausentes no Excel: {missing}")

    out = df[[c.raw for c in ISPC_COLS]].copy()
    rename = {c.raw: c.key for c in ISPC_COLS}
    out = out.rename(columns=rename)

    for k in ISPC_FEATURE_KEYS:
        out[k] = pd.to_numeric(out[k], errors="coerce")

    return out


def standardize_from_csv(df: pd.DataFrame) -> pd.DataFrame:
    # Aceita CSV já padronizado (keys) ou com cabeçalhos "raw" (como no Excel)
    key_cols = [c.key for c in ISPC_COLS]
    raw_cols = [c.raw for c in ISPC_COLS]

    if all(c in df.columns for c in key_cols):
        out = df[key_cols].copy()
    elif all(c in df.columns for c in raw_cols):
        out = standardize_from_excel(df)
    else:
        missing_keys = [c for c in key_cols if c not in df.columns]
        missing_raw = [c for c in raw_cols if c not in df.columns]
        raise ValueError(
            "CSV não tem colunas suficientes. "
            f"Faltando (formato padronizado): {missing_keys}; "
            f"faltando (formato Excel): {missing_raw}"
        )

    for k in ISPC_FEATURE_KEYS:
        out[k] = pd.to_numeric(out[k], errors="coerce")

    return out


def compute_minmax(df: pd.DataFrame) -> dict:
    result: dict[str, dict[str, float | int]] = {}
    for k in ISPC_FEATURE_KEYS:
        series = df[k].dropna()
        if series.empty:
            result[k] = {"min": math.nan, "max": math.nan, "count": 0}
        else:
            result[k] = {
                "min": float(series.min()),
                "max": float(series.max()),
                "count": int(series.shape[0]),
            }
    return result


def compute_correlations(df: pd.DataFrame, method: str) -> pd.DataFrame:
    features = df[ISPC_FEATURE_KEYS].copy()
    return features.corr(method=method)


def high_corr_pairs(corr: pd.DataFrame, threshold: float) -> list[dict]:
    rows: list[dict] = []
    cols = list(corr.columns)
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            a = cols[i]
            b = cols[j]
            val = corr.loc[a, b]
            if pd.isna(val):
                continue
            if abs(val) >= threshold:
                rows.append({"var_a": a, "var_b": b, "corr": float(val), "abs_corr": float(abs(val))})
    rows.sort(key=lambda r: r["abs_corr"], reverse=True)
    return rows


def correlation_clusters(pairs: list[dict]) -> list[set[str]]:
    # Conecta variáveis se estiverem em pares de alta correlação
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        parent.setdefault(x, x)
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]

    def union(a: str, b: str) -> None:
        ra = find(a)
        rb = find(b)
        if ra != rb:
            parent[rb] = ra

    for p in pairs:
        union(p["var_a"], p["var_b"])

    groups: dict[str, set[str]] = {}
    for v in list(parent.keys()):
        r = find(v)
        groups.setdefault(r, set()).add(v)

    # Filtrar clusters com pelo menos 2 variáveis
    clusters = [g for g in groups.values() if len(g) >= 2]
    clusters.sort(key=lambda s: (-len(s), sorted(list(s))[0]))
    return clusters


def build_reduction_report(pairs: list[dict], clusters: list[set[str]], depth: str | None, method: str, threshold: float) -> str:
    lines: list[str] = []
    title_depth = f" (profundidade {depth} cm)" if depth else ""
    lines.append(f"# Relatório de redução de variáveis ISPC{title_depth}\n")
    lines.append(f"- Método de correlação: `{method}`")
    lines.append(f"- Limiar de |r| para considerar redundância: `{threshold}`\n")

    if not pairs:
        lines.append("Nenhum par com alta correlação encontrado no limiar selecionado.\n")
        return "\n".join(lines)

    lines.append("## Pares com maior correlação (top 20)\n")
    for p in pairs[:20]:
        lines.append(f"- {p['var_a']} × {p['var_b']}: r={p['corr']:.3f}")

    lines.append("\n## Clusters de redundância (componentes conexas)\n")
    if not clusters:
        lines.append("Nenhum cluster (além de pares isolados) foi formado.\n")
    else:
        for idx, cluster in enumerate(clusters, start=1):
            items = ", ".join(sorted(cluster))
            lines.append(f"- Cluster {idx}: {items}")

    lines.append("\n## Sugestão prática de redução\n")
    lines.append(
        "A sugestão abaixo é **conservadora**: para cada cluster, tente manter 1 variável representativa e remover as demais **somente após** validar se a interpretação científica continua consistente (ex.: regressões, sensibilidade do índice fuzzy, validação cruzada).\n"
    )

    # Heurística de representatividade
    prefer = [
        "produtividade",
        "estoque_c",
        "densidade",
        "icv",
        "dmg",
        "dmp",
        "rmp",
        "peso_espigas",
        "n_espigas_com",
        "n_espigas",
        "n_plantas",
        "altura",
        "diam_espiga",
        "comp_espiga",
        "na",
    ]

    def choose_representative(cluster: set[str]) -> str:
        for p in prefer:
            if p in cluster:
                return p
        return sorted(cluster)[0]

    for idx, cluster in enumerate(clusters, start=1):
        rep = choose_representative(cluster)
        drops = [v for v in sorted(cluster) if v != rep]
        lines.append(f"- Cluster {idx}: manter `{rep}`; candidatos a remover: {', '.join(f'`{d}`' for d in drops)}")

    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Pipeline de organização e auditoria do banco ISPC.")
    parser.add_argument("--excel", type=str, help="Caminho para banco_dados.xlsx")
    parser.add_argument("--csv", type=str, help="Caminho para CSV mestre (recomendado para histórico com coluna ano)")
    parser.add_argument("--sheet", type=str, default="dados_010", help="Aba do Excel (ex.: dados_010, dados_1020)")
    parser.add_argument("--out", type=str, default=str(Path("data") / "ispc"), help="Diretório de saída")
    parser.add_argument("--ano", type=int, default=None, help="Ano (opcional). Se informado, entra na coluna ano")
    parser.add_argument("--profundidade", type=str, default=None, help="Profundidade cm (opcional). Ex.: 0-10")
    parser.add_argument("--corr-method", type=str, default="pearson", choices=["pearson", "spearman"], help="Método")
    parser.add_argument("--corr-threshold", type=float, default=0.85, help="Limiar de |r|")

    args = parser.parse_args()

    if bool(args.excel) == bool(args.csv):
        raise SystemExit("Informe exatamente uma fonte de dados: --excel OU --csv")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    depth = args.profundidade or parse_depth_from_sheet(args.sheet)

    if args.excel:
        excel_path = Path(args.excel)
        df_raw = load_excel_sheet(excel_path, args.sheet)
        df = standardize_from_excel(df_raw)
        suffix = args.sheet

        df.insert(0, "ano", args.ano if args.ano is not None else "")
        df.insert(1, "profundidade_cm", depth if depth else "")
    else:
        csv_path = Path(args.csv)
        df_raw = load_csv(csv_path)

        # Se o CSV já tiver ano/profundidade, preserva.
        # Se não tiver, cria. Se tiver e o usuário passou --ano/--profundidade,
        # preenche apenas valores vazios.
        if "ano" not in df_raw.columns:
            df_raw.insert(0, "ano", args.ano if args.ano is not None else "")
        elif args.ano is not None:
            df_raw["ano"] = df_raw["ano"].replace("", pd.NA).fillna(args.ano)

        if "profundidade_cm" not in df_raw.columns:
            df_raw.insert(1, "profundidade_cm", depth if depth else "")
        elif depth:
            df_raw["profundidade_cm"] = df_raw["profundidade_cm"].replace("", pd.NA).fillna(depth)

        df = standardize_from_csv(df_raw)

        # Re-anexar colunas de identificação no início
        meta_cols = []
        for meta in ["ano", "profundidade_cm"]:
            if meta in df_raw.columns:
                meta_cols.append(meta)
        df = pd.concat([df_raw[meta_cols].copy(), df], axis=1)

        suffix = csv_path.stem
        if suffix.startswith("ispc_records_"):
            suffix = suffix[len("ispc_records_") :]

        # Se o CSV tiver profundidade única, usa no relatório
        if "profundidade_cm" in df.columns:
            vals = df["profundidade_cm"].dropna().astype(str)
            uniq = sorted(set(v for v in vals.tolist() if v.strip() != ""))
            if len(uniq) == 1 and not depth:
                depth = uniq[0]
    records_path = out_dir / f"ispc_records_{suffix}.csv"
    df.to_csv(records_path, index=False, quoting=csv.QUOTE_MINIMAL)

    minmax = compute_minmax(df)
    minmax_path = out_dir / f"ispc_minmax_{suffix}.json"
    minmax_path.write_text(json.dumps(minmax, indent=2, ensure_ascii=False), encoding="utf-8")

    corr = compute_correlations(df, method=args.corr_method)
    corr_path = out_dir / f"ispc_correlations_{suffix}_{args.corr_method}.csv"
    corr.to_csv(corr_path)

    pairs = high_corr_pairs(corr, threshold=args.corr_threshold)
    pairs_path = out_dir / f"ispc_high_corr_pairs_{suffix}_{args.corr_method}_{args.corr_threshold:.2f}.csv"
    pd.DataFrame(pairs).to_csv(pairs_path, index=False)

    clusters = correlation_clusters(pairs)
    report = build_reduction_report(pairs, clusters, depth, args.corr_method, args.corr_threshold)
    report_path = out_dir / f"ispc_reduction_report_{suffix}_{args.corr_method}_{args.corr_threshold:.2f}.md"
    report_path.write_text(report, encoding="utf-8")

    print(f"OK: {records_path}")
    print(f"OK: {minmax_path}")
    print(f"OK: {corr_path}")
    print(f"OK: {pairs_path}")
    print(f"OK: {report_path}")


if __name__ == "__main__":
    main()
