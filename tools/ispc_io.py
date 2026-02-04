"""Módulo de I/O para leitura e escrita padronizada de dados do ISPC.

Centraliza todas as operações de entrada/saída, garantindo
consistência e tratamento robusto de erros.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

import pandas as pd

from ispc_common import ALL_FEATURES, META_COLS, TARGETS, filter_by_depth_tag, to_numeric_dataframe
from ispc_errors import FileFormatError, MissingColumnError, validate_columns, validate_file_exists


# ============================================================================
# LEITURA DE DADOS
# ============================================================================

def load_records_csv(
    csv_path: Path,
    required_cols: list[str] | None = None,
) -> pd.DataFrame:
    """Carrega registros de arquivo CSV com validação.

    Args:
        csv_path: Caminho do arquivo CSV
        required_cols: Colunas obrigatórias (None = usa META_COLS)

    Returns:
        DataFrame validado e com colunas numéricas convertidas

    Raises:
        FileNotFoundError: Se arquivo não existir
        MissingColumnError: Se colunas obrigatórias estiverem faltando
    """
    validate_file_exists(csv_path)

    df = pd.read_csv(csv_path)

    # Valida metadados
    req = required_cols or META_COLS
    validate_columns(df, req, context=f"CSV {csv_path.name}")

    # Converte features numéricas
    numeric_cols = [c for c in ALL_FEATURES + TARGETS if c in df.columns]
    df = to_numeric_dataframe(df, numeric_cols)

    return df


def load_records_for_tag(
    data_dir: Path,
    tag: str,
    explicit_csv: Path | None = None,
) -> pd.DataFrame | None:
    """Carrega registros para uma tag de profundidade específica.

    Ordem de preferência:
    1. Arquivo explícito (se fornecido)
    2. data_dir/ispc_records_{tag}.csv
    3. data_dir/ispc_records_mestre.csv (filtrado por tag)

    Args:
        data_dir: Diretório com arquivos de dados
        tag: Tag de profundidade (dados_010, dados_1020)
        explicit_csv: Caminho explícito de CSV (opcional)

    Returns:
        DataFrame com registros ou None se nenhum arquivo válido existir
    """
    candidates: list[Path] = []

    if explicit_csv is not None:
        candidates.append(explicit_csv)
    else:
        candidates.append(data_dir / f"ispc_records_{tag}.csv")
        candidates.append(data_dir / "ispc_records_mestre.csv")

    for path in candidates:
        if not path.exists():
            continue

        try:
            df = load_records_csv(path)

            # Se for arquivo mestre, filtra por tag
            if path.name == "ispc_records_mestre.csv":
                df = filter_by_depth_tag(df, tag)

            if df.shape[0] > 0:
                return df

        except Exception:
            # Tenta próximo candidato
            continue

    return None


def load_json(json_path: Path) -> dict[str, Any]:
    """Carrega arquivo JSON.

    Args:
        json_path: Caminho do arquivo JSON

    Returns:
        Dicionário com dados do JSON

    Raises:
        FileNotFoundError: Se arquivo não existir
        FileFormatError: Se JSON for inválido
    """
    validate_file_exists(json_path)

    try:
        with open(json_path, encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        raise FileFormatError(str(json_path), "JSON válido") from e


def load_tuning_report_csv(csv_path: Path) -> list[dict[str, Any]]:
    """Carrega relatório de tuning de CSV.

    Args:
        csv_path: Caminho do CSV de tuning

    Returns:
        Lista de dicionários com resultados de tuning

    Raises:
        FileNotFoundError: Se arquivo não existir
    """
    validate_file_exists(csv_path)

    rows: list[dict[str, Any]] = []

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            rows.append(dict(row))

    return rows


# ============================================================================
# ESCRITA DE DADOS
# ============================================================================

def save_dataframe_csv(
    df: pd.DataFrame,
    csv_path: Path,
    index: bool = False,
) -> None:
    """Salva DataFrame em arquivo CSV.

    Args:
        df: DataFrame a salvar
        csv_path: Caminho de destino
        index: Se True, salva índice do DataFrame
    """
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(csv_path, index=index, encoding="utf-8")


def save_json(
    data: dict[str, Any],
    json_path: Path,
    indent: int = 2,
) -> None:
    """Salva dados em arquivo JSON formatado.

    Args:
        data: Dicionário a salvar
        json_path: Caminho de destino
        indent: Número de espaços para indentação
    """
    json_path.parent.mkdir(parents=True, exist_ok=True)

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=indent, ensure_ascii=False)


def save_csv_from_dicts(
    rows: list[dict[str, Any]],
    csv_path: Path,
    fieldnames: list[str] | None = None,
) -> None:
    """Salva lista de dicionários em CSV.

    Args:
        rows: Lista de dicionários (cada dict é uma linha)
        csv_path: Caminho de destino
        fieldnames: Nomes das colunas (None = infere do primeiro dict)
    """
    if not rows:
        return

    csv_path.parent.mkdir(parents=True, exist_ok=True)

    # Infere fieldnames se não fornecido
    fields = fieldnames or list(rows[0].keys())

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def write_js_umd(
    global_name: str,
    data: dict[str, Any],
    js_path: Path,
) -> None:
    """Escreve bundle JavaScript em formato UMD.

    Args:
        global_name: Nome da variável global JavaScript
        data: Dados a exportar (serializados como JSON)
        js_path: Caminho de destino do arquivo .js
    """
    js_path.parent.mkdir(parents=True, exist_ok=True)

    json_str = json.dumps(data, indent=2, ensure_ascii=False)

    # Template UMD
    umd_template = f"""(function(root, factory) {{
  if (typeof define === 'function' && define.amd) {{
    define([], factory);
  }} else if (typeof module === 'object' && module.exports) {{
    module.exports = factory();
  }} else {{
    root.{global_name} = factory();
  }}
}}(typeof self !== 'undefined' ? self : this, function() {{
  return {json_str};
}}));
"""

    with open(js_path, "w", encoding="utf-8") as f:
        f.write(umd_template)


# ============================================================================
# UTILITÁRIOS
# ============================================================================

def ensure_directory(path: Path) -> None:
    """Garante que diretório existe (cria se necessário).

    Args:
        path: Caminho do diretório
    """
    path.mkdir(parents=True, exist_ok=True)


def list_csv_files(directory: Path, pattern: str = "*.csv") -> list[Path]:
    """Lista arquivos CSV em diretório.

    Args:
        directory: Diretório a listar
        pattern: Padrão glob (default: *.csv)

    Returns:
        Lista de caminhos de arquivos CSV
    """
    if not directory.exists():
        return []

    return sorted(directory.glob(pattern))


def backup_file(file_path: Path, suffix: str = ".bak") -> Path | None:
    """Cria backup de arquivo existente.

    Args:
        file_path: Caminho do arquivo original
        suffix: Sufixo para arquivo de backup

    Returns:
        Caminho do backup ou None se arquivo não existir
    """
    if not file_path.exists():
        return None

    backup_path = file_path.with_suffix(file_path.suffix + suffix)

    # Se backup já existe, adiciona contador
    counter = 1
    while backup_path.exists():
        backup_path = file_path.with_suffix(f"{file_path.suffix}{suffix}{counter}")
        counter += 1

    import shutil

    shutil.copy2(file_path, backup_path)

    return backup_path
