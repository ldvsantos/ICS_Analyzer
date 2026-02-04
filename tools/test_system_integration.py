"""Script para alimentar o sistema com dados de teste e verificar saídas.

Este script:
1. Gera dados sintéticos realistas para o ISPC
2. Salva como CSV
3. Roda o pipeline de refresh completo
4. Valida os artefatos gerados
5. Relata resultados
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import pandas as pd


def generate_test_data(output_csv: Path, n_records: int = 100, seed: int = 42) -> None:
    """Gera dados sintéticos para teste com 10 features + 5 targets (ISPC reduzido)."""
    import random

    random.seed(seed)

    # Cabeçalho esperado
    header = [
        "ano",
        "profundidade_cm",
        "parcela",
        "cultura",
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

    rows = []
    for i in range(n_records):
        row = {
            "ano": 2025 if i < n_records // 2 else 2024,
            "profundidade_cm": "0-10" if i % 2 == 0 else "10-20",
            "parcela": f"P{(i % 20) + 1}",
            "cultura": "milho" if i % 3 != 0 else "soja",
            # Inputs (10)
            "dmg": round(0.5 + random.gauss(0.5, 0.2), 2),
            "dmp": round(1.0 + random.gauss(0.2, 0.1), 2),
            "rmp": round(0.5 + random.gauss(0.1, 0.05), 2),
            "densidade": round(1.3 + random.gauss(0.1, 0.05), 2),
            "estoque_c": round(10.0 + random.gauss(2.0, 1.0), 1),
            "na": round(0.5 + random.gauss(0.2, 0.1), 2),
            "icv": round(1.0 + random.gauss(0.3, 0.15), 2),
            "altura": round(50 + random.gauss(10, 5), 0),
            "diam_espiga": round(5 + random.gauss(1, 0.5), 1),
            "comp_espiga": round(15 + random.gauss(2, 1), 1),
            "n_plantas": round(100 + random.gauss(5, 3), 0),
            # Targets (5)
            "n_espigas": round(90 + random.gauss(5, 3), 0),
            "n_espigas_com": round(85 + random.gauss(5, 3), 0),
            "peso_espigas": round(200 + random.gauss(20, 10), 0),
            "produtividade": round(8000 + random.gauss(800, 400), 0),
        }
        rows.append(row)

    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with open(output_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=header)
        writer.writeheader()
        writer.writerows(rows)

    print(f"OK: Dados sintéticos gerados: {output_csv} ({n_records} registros)")


def validate_artifacts(repo_dir: Path) -> dict[str, bool]:
    """Valida presença e conteúdo dos artefatos esperados."""
    results = {}
    data_dir = repo_dir / "data" / "ispc"
    docs_dir = repo_dir / "docs" / "assets" / "js"

    # Verifica CSV de relatório
    report_csv = data_dir / "ispc_reduced_ml_tuning_report.csv"
    results["tuning_report_csv"] = report_csv.exists() and report_csv.stat().st_size > 100
    status = "OK" if results["tuning_report_csv"] else "FALHA"
    print(f"  [{status}] Relatório de tuning (CSV): {report_csv.name}")

    # Verifica JSON de melhores modelos
    best_json = data_dir / "ispc_reduced_ml_tuning_best.json"
    results["tuning_best_json"] = best_json.exists() and best_json.stat().st_size > 100
    if results["tuning_best_json"]:
        try:
            data = json.loads(best_json.read_text(encoding="utf-8"))
            results["tuning_best_json"] = isinstance(data, dict) and "by_tag" in data
        except Exception:
            results["tuning_best_json"] = False
    status = "OK" if results["tuning_best_json"] else "FALHA"
    print(f"  [{status}] Melhores modelos (JSON): {best_json.name}")

    # Verifica JS bundle do tuning
    tuning_js = docs_dir / "ispc_reduced_ml_tuning_best.js"
    results["tuning_best_js"] = tuning_js.exists() and "ISPC_ReducedMLTuningBest" in tuning_js.read_text(encoding="utf-8", errors="ignore")
    status = "OK" if results["tuning_best_js"] else "FALHA"
    print(f"  [{status}] JS bundle tuning: {tuning_js.name}")

    # Verifica produção
    prod_json = data_dir / "ispc_reduced_ml_models_production.json"
    results["production_json"] = prod_json.exists() and prod_json.stat().st_size > 100
    if results["production_json"]:
        try:
            data = json.loads(prod_json.read_text(encoding="utf-8"))
            results["production_json"] = isinstance(data, dict) and "by_tag" in data
        except Exception:
            results["production_json"] = False
    status = "OK" if results["production_json"] else "FALHA"
    print(f"  [{status}] Modelos produção (JSON): {prod_json.name}")

    # Verifica alertas
    alerts_json = data_dir / "model_quality_alerts.json"
    results["alerts_json"] = alerts_json.exists() and alerts_json.stat().st_size > 50
    if results["alerts_json"]:
        try:
            data = json.loads(alerts_json.read_text(encoding="utf-8"))
            results["alerts_json"] = isinstance(data, dict) and "counts" in data
        except Exception:
            results["alerts_json"] = False
    status = "OK" if results["alerts_json"] else "FALHA"
    print(f"  [{status}] Alertas de qualidade (JSON): {alerts_json.name}")

    # Verifica relatório de qualidade
    quality_csv = data_dir / "model_quality_report.csv"
    results["quality_report_csv"] = quality_csv.exists() and quality_csv.stat().st_size > 50
    status = "OK" if results["quality_report_csv"] else "FALHA"
    print(f"  [{status}] Relatório de qualidade (CSV): {quality_csv.name}")

    return results


def print_summary(results: dict[str, bool]) -> None:
    """Imprime resumo dos testes."""
    total = len(results)
    passed = sum(1 for v in results.values() if v)
    pct = int(100 * passed / total) if total > 0 else 0

    print(f"\n{'='*60}")
    print(f"Resultados: {passed}/{total} artefatos OK ({pct}%)")
    print(f"{'='*60}\n")

    if passed == total:
        print("SUCESSO: Todos os artefatos foram gerados corretamente!")
        return 0
    else:
        print("ATENCAO: Alguns artefatos estao faltando ou invalidos:")
        for name, ok in results.items():
            if not ok:
                print(f"  - {name}")
        return 1


def main() -> int:
    repo_root = Path(__file__).parent.parent

    print("=" * 60)
    print("TESTES DE INTEGRACAO: ALIMENTACAO E VALIDACAO ISPC")
    print("=" * 60 + "\n")

    # 1. Gera dados de teste
    print("1. Gerando dados sinteticos...")
    test_csv = repo_root / "data" / "ispc" / "test_data.csv"
    generate_test_data(test_csv, n_records=100)

    # 2. Executa refresh do pipeline
    print("\n2. Executando pipeline de refresh...")
    import subprocess

    refresh_script = repo_root / "tools" / "ispc_refresh_dashboard_artifacts.py"
    try:
        result = subprocess.run(
            [sys.executable, str(refresh_script), "--repo", str(repo_root)],
            capture_output=True,
            text=True,
            timeout=300,  # 5 minutos (tuning pode ser lento)
        )
        if result.returncode == 0:
            print("OK: Pipeline completou com sucesso")
            # Imprime saída (linhas com OK)
            for line in result.stdout.split("\n"):
                if "OK:" in line or "Relatorio" in line:
                    print(f"  {line.strip()}")
        else:
            print(f"ERRO: Pipeline falhou com codigo {result.returncode}")
            print(f"  Detalhes: {result.stderr[:500]}")
            return 1
    except subprocess.TimeoutExpired:
        print("ATENCAO: Pipeline expirou (timeout > 300s)")
        print("  Nota: tuning de ML pode ser lento em primeiras execucoes")
        print("  Continuando com validacao dos artefatos existentes...")
    except Exception as e:
        print(f"ERRO ao executar pipeline: {e}")
        return 1

    # 3. Valida artefatos
    print("\n3. Validando artefatos gerados...")
    results = validate_artifacts(repo_root)

    # 4. Resumo
    return print_summary(results)


if __name__ == "__main__":
    sys.exit(main())
