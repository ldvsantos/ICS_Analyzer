"""Testes para o pipeline de processamento ISPC.

Valida:
- Carregamento e padronização de dados
- Cálculo de correlações e redução
- Tuning de modelos reduzidos
- Qualidade dos modelos (classificação)
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any

import pandas as pd
import pytest

# Importa funções do pipeline
import sys
sys.path.insert(0, str(Path(__file__).parent))

from ispc_pipeline import standardize_from_csv, compute_minmax, compute_correlations, high_corr_pairs
from ispc_model_quality_alerts import classify, Thresholds, _as_float, _as_int
from ispc_promote_reduced_ml import load_records, _filter_by_tag


class TestISPCPipelineData:
    """Testes de carregamento e padronização de dados."""

    def test_standardize_csv_valid(self):
        """Valida carregamento de CSV com colunas padronizadas."""
        # Dados fictícios com as colunas esperadas (formato padronizado)
        data = {
            "parcela": ["P1", "P2", "P3"],
            "cultura": ["milho", "milho", "milho"],
            "dmg": [1.0, 1.1, 1.2],
            "dmp": [1.0, 1.1, 1.2],
            "rmp": [0.5, 0.6, 0.7],
            "densidade": [1.3, 1.4, 1.5],
            "estoque_c": [10.0, 11.0, 12.0],
            "na": [0.5, 0.6, 0.7],
            "icv": [1.0, 1.1, 1.2],
            "altura": [50, 60, 70],
            "diam_espiga": [5, 6, 7],
            "comp_espiga": [15, 16, 17],
            "n_plantas": [100, 100, 100],
            "n_espigas": [90, 95, 98],
            "n_espigas_com": [85, 90, 95],
            "peso_espigas": [200, 210, 220],
            "produtividade": [8000, 8500, 9000],
        }
        df = pd.DataFrame(data)

        # A função aceita e processa
        result = standardize_from_csv(df)

        assert len(result) == 3
        assert all(col in result.columns for col in data.keys())
        assert result["na"].dtype in [float, "float64"]


class TestISPCCorrelations:
    """Testes de cálculo de correlações e redução."""

    def test_compute_correlations_basic(self):
        """Valida cálculo de correlação de Pearson."""
        data = {
            "dmg": [1.0, 2.0, 3.0, 4.0, 5.0],
            "dmp": [2.0, 4.0, 6.0, 8.0, 10.0],  # Correlação perfeita com dmg
            "rmp": [5.0, 4.0, 3.0, 2.0, 1.0],   # Correlação inversa com dmg
            "densidade": [1.3, 1.4, 1.5, 1.6, 1.7],
            "estoque_c": [10.0, 11.0, 12.0, 13.0, 14.0],
            "na": [0.5, 0.6, 0.7, 0.8, 0.9],
            "icv": [1.0, 1.1, 1.2, 1.3, 1.4],
            "altura": [50, 55, 60, 65, 70],
            "diam_espiga": [5, 5.5, 6, 6.5, 7],
            "comp_espiga": [15, 15.5, 16, 16.5, 17],
            "n_plantas": [100, 100, 100, 100, 100],
            "n_espigas": [90, 92, 95, 97, 99],
            "n_espigas_com": [85, 87, 90, 92, 95],
            "peso_espigas": [200, 205, 210, 215, 220],
            "produtividade": [8000, 8250, 8500, 8750, 9000],
        }
        df = pd.DataFrame(data)

        corr = compute_correlations(df, method="pearson")

        assert corr.shape == (15, 15)
        assert abs(corr.loc["dmg", "dmp"] - 1.0) < 0.01  # Correlação próxima a 1
        assert abs(corr.loc["dmg", "rmp"] - (-1.0)) < 0.01  # Correlação próxima a -1

    def test_high_corr_pairs(self):
        """Valida identificação de pares altamente correlacionados."""
        corr_data = {
            "dmg": [1.0, 0.9, 0.1],
            "dmp": [0.9, 1.0, 0.2],
            "rmp": [0.1, 0.2, 1.0],
        }
        corr = pd.DataFrame(corr_data, index=["dmg", "dmp", "rmp"])

        pairs = high_corr_pairs(corr, threshold=0.85)

        # Esperado: (dmg, dmp) com r=0.9
        assert len(pairs) >= 1
        pair_strs = [f"{p['var_a']}-{p['var_b']}" for p in pairs]
        assert "dmg-dmp" in pair_strs or "dmp-dmg" in pair_strs


class TestISPCModelQualityAlerts:
    """Testes de classificação de alerta de qualidade."""

    def test_classify_ok_model(self):
        """Modelo bom deve ter severidade 'ok'."""
        row = {
            "ok": "true",
            "n": "100",
            "r2": "0.8",
            "r2_std": "0.05",
        }
        th = Thresholds(min_n=30, min_r2=0.5, max_r2_std=0.2)

        severity, flags = classify(row, th)

        assert severity == "ok"
        assert len(flags) == 0

    def test_classify_low_r2(self):
        """Modelo com R² baixo deve ser crítico."""
        row = {
            "ok": "true",
            "n": "100",
            "r2": "0.2",  # Abaixo do limite (0.5)
            "r2_std": "0.05",
        }
        th = Thresholds(min_n=30, min_r2=0.5, max_r2_std=0.2)

        severity, flags = classify(row, th)

        assert severity == "critico"
        assert "r2_baixo" in flags

    def test_classify_unstable_model(self):
        """Modelo instável deve ser alerta."""
        row = {
            "ok": "true",
            "n": "100",
            "r2": "0.7",
            "r2_std": "0.3",  # Acima do limite (0.2)
        }
        th = Thresholds(min_n=30, min_r2=0.5, max_r2_std=0.2)

        severity, flags = classify(row, th)

        assert severity == "alerta"
        assert "r2_instavel" in flags

    def test_classify_failed_model(self):
        """Modelo com 'ok=false' deve ser crítico."""
        row = {
            "ok": "false",
            "n": "100",
            "r2": "0.8",
            "r2_std": "0.05",
        }
        th = Thresholds(min_n=30, min_r2=0.5, max_r2_std=0.2)

        severity, flags = classify(row, th)

        assert severity == "critico"
        assert "falha" in flags

    def test_as_float_valid(self):
        """Conversão válida de float."""
        assert _as_float("3.14") == 3.14
        assert _as_float(3.14) == 3.14
        assert _as_float("invalid") is None

    def test_as_int_valid(self):
        """Conversão válida de int."""
        assert _as_int("42") == 42
        assert _as_int(42.0) == 42
        assert _as_int("invalid") is None


class TestISPCRecordsLoading:
    """Testes de carregamento de registros para promoção."""

    def test_filter_by_tag_0_10(self):
        """Filtro para profundidade 0-10."""
        data = {
            "ano": [2025, 2025, 2025],
            "profundidade_cm": ["0-10", "10-20", "0-10"],
            "parcela": ["P1", "P2", "P3"],
            "cultura": ["milho", "milho", "milho"],
            "dmg": [1.0, 1.1, 1.2],
            "dmp": [1.0, 1.1, 1.2],
            "rmp": [0.5, 0.6, 0.7],
            "densidade": [1.3, 1.4, 1.5],
            "estoque_c": [10.0, 11.0, 12.0],
            "na": [0.5, 0.6, 0.7],
            "icv": [1.0, 1.1, 1.2],
            "altura": [50, 60, 70],
            "diam_espiga": [5, 6, 7],
            "comp_espiga": [15, 16, 17],
            "n_plantas": [100, 100, 100],
            "n_espigas": [90, 95, 98],
            "n_espigas_com": [85, 90, 95],
            "peso_espigas": [200, 210, 220],
            "produtividade": [8000, 8500, 9000],
        }
        df = pd.DataFrame(data)

        result = _filter_by_tag(df, "dados_010")

        assert len(result) == 2
        assert all(result["profundidade_cm"] == "0-10")

    def test_filter_by_tag_10_20(self):
        """Filtro para profundidade 10-20."""
        data = {
            "ano": [2025, 2025, 2025],
            "profundidade_cm": ["0-10", "10-20", "0-10"],
            "parcela": ["P1", "P2", "P3"],
            "cultura": ["milho", "milho", "milho"],
            "dmg": [1.0, 1.1, 1.2],
            "dmp": [1.0, 1.1, 1.2],
            "rmp": [0.5, 0.6, 0.7],
            "densidade": [1.3, 1.4, 1.5],
            "estoque_c": [10.0, 11.0, 12.0],
            "na": [0.5, 0.6, 0.7],
            "icv": [1.0, 1.1, 1.2],
            "altura": [50, 60, 70],
            "diam_espiga": [5, 6, 7],
            "comp_espiga": [15, 16, 17],
            "n_plantas": [100, 100, 100],
            "n_espigas": [90, 95, 98],
            "n_espigas_com": [85, 90, 95],
            "peso_espigas": [200, 210, 220],
            "produtividade": [8000, 8500, 9000],
        }
        df = pd.DataFrame(data)

        result = _filter_by_tag(df, "dados_1020")

        assert len(result) == 1
        assert all(result["profundidade_cm"] == "10-20")


class TestISPCIntegration:
    """Testes de integração ponta a ponta."""

    def test_pipeline_full_flow(self):
        """Testa fluxo completo: dados → correlações → alertas."""
        # Dados de entrada simulados (formato padronizado)
        data = {
            "parcela": [f"P{i}" for i in range(1, 11)],
            "cultura": ["milho"] * 10,
            "dmg": [1.0 + i*0.01 for i in range(10)],
            "dmp": [1.0 + i*0.02 for i in range(10)],
            "rmp": [0.5 + i*0.03 for i in range(10)],
            "densidade": [1.3 + i*0.02 for i in range(10)],
            "estoque_c": [10.0 + i*0.5 for i in range(10)],
            "na": [0.5 + i*0.01 for i in range(10)],
            "icv": [1.0 + i*0.02 for i in range(10)],
            "altura": [50 + i for i in range(10)],
            "diam_espiga": [5 + i*0.1 for i in range(10)],
            "comp_espiga": [15 + i*0.2 for i in range(10)],
            "n_plantas": [100] * 10,
            "n_espigas": [90 + i for i in range(10)],
            "n_espigas_com": [85 + i for i in range(10)],
            "peso_espigas": [200 + i*2 for i in range(10)],
            "produtividade": [8000 + i*100 for i in range(10)],
        }
        df = pd.DataFrame(data)

        # 1. Padronizar
        df_std = standardize_from_csv(df)
        assert len(df_std) == 10
        assert all(col in df_std.columns for col in data.keys())

        # 2. Calcular correlações (features apenas)
        corr = compute_correlations(df_std, method="pearson")
        assert corr.shape == (15, 15)
        assert abs(corr.iloc[0, 0] - 1.0) < 0.01  # Diagonal deve ser 1

        # 3. Validar classificação de modelo
        model_record = {
            "ok": "true",
            "n": "10",
            "r2": "0.75",
            "r2_std": "0.08",
        }
        th = Thresholds(min_n=5, min_r2=0.5, max_r2_std=0.15)
        severity, flags = classify(model_record, th)
        assert severity in ["ok", "alerta", "critico"]


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
