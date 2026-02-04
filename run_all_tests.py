#!/usr/bin/env python
"""Script para rodar todos os testes do sistema ICS Analyzer.

Uso:
  python run_all_tests.py          # Executa todos os testes
  python run_all_tests.py --quick  # Apenas testes unitarios (rapido)
  python run_all_tests.py --full   # Todos inclusive integracao (lento)
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def run_pytest_suite() -> int:
    """Executa suite de testes unitarios."""
    print("\n" + "=" * 60)
    print("TESTES UNITARIOS - Pipeline ISPC")
    print("=" * 60)

    repo_root = Path(__file__).parent
    test_file = repo_root / "tools" / "tests_ispc_pipeline.py"

    result = subprocess.run(
        [sys.executable, "-m", "pytest", str(test_file), "-v", "--tb=short"],
        cwd=repo_root,
    )

    return result.returncode


def run_integration_tests() -> int:
    """Executa testes de integracao."""
    print("\n" + "=" * 60)
    print("TESTES DE INTEGRACAO - Sistema Completo")
    print("=" * 60)

    repo_root = Path(__file__).parent
    test_file = repo_root / "tools" / "test_system_integration.py"

    result = subprocess.run([sys.executable, str(test_file)], cwd=repo_root)

    return result.returncode


def print_header() -> None:
    """Imprime cabecalho."""
    print("\n")
    print("*" * 60)
    print("*  SUITE DE TESTES - ICS ANALYZER")
    print("*" * 60)


def print_footer(code: int) -> None:
    """Imprime rodape com resultado final."""
    status = "SUCESSO" if code == 0 else "FALHA"
    print("\n" + "=" * 60)
    print(f"RESULTADO FINAL: {status}")
    print("=" * 60 + "\n")


def main() -> int:
    quick_mode = "--quick" in sys.argv
    full_mode = "--full" in sys.argv or not quick_mode

    print_header()

    exit_code = 0

    # Sempre roda testes unitarios
    if run_pytest_suite() != 0:
        exit_code = 1

    # Roda integracao se nao for quick mode
    if full_mode and not quick_mode:
        if run_integration_tests() != 0:
            exit_code = 1

    print_footer(exit_code)
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
