"""
Testes do pipeline: os números do painel têm que fechar com os dados brutos.

Rodar: python -m pytest pipeline/tests
"""

import os
import sys

import pandas as pd
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import gerar_dados  # noqa: E402
import transformar  # noqa: E402

CENTAVO = 0.01


@pytest.fixture(scope="module")
def brutos(tmp_path_factory):
    pasta = tmp_path_factory.mktemp("bruto")
    notas, devol, metas, produtos = gerar_dados.gerar(semente=42)
    notas.to_csv(pasta / "notas_itens.csv", index=False)
    devol.to_csv(pasta / "devolucoes.csv", index=False)
    metas.to_csv(pasta / "metas.csv", index=False)
    produtos.to_csv(pasta / "produtos.csv", index=False)
    return transformar.carregar(str(pasta))


@pytest.fixture(scope="module")
def painel(brutos):
    return transformar.transformar(*brutos)


def test_geracao_e_deterministica(brutos):
    notas, devol, _, _ = brutos
    notas2, devol2, _, _ = gerar_dados.gerar(semente=42)
    assert len(notas) == len(notas2)
    assert notas["valor"].sum() == pytest.approx(notas2["valor"].sum())
    assert devol["valor"].sum() == pytest.approx(devol2["valor"].sum())


def test_total_geral_fecha_com_os_dados_brutos(brutos, painel):
    notas, devol, _, _ = brutos
    bruto = sum(linha[0] for linha in painel["mensal"]["Todas|Todos"])
    devolvido = sum(linha[1] for linha in painel["mensal"]["Todas|Todos"])
    assert bruto == pytest.approx(notas["valor"].sum(), abs=CENTAVO * len(painel["meses"]))
    assert devolvido == pytest.approx(devol["valor"].sum(), abs=CENTAVO * len(painel["meses"]))


@pytest.mark.parametrize("indice", [0, 1, 2, 3])  # bruto, devoluções, notas (somáveis)
def test_filiais_e_canais_somam_o_total(painel, indice):
    total = painel["mensal"]["Todas|Todos"]
    for m in range(len(painel["meses"])):
        soma_filiais = sum(painel["mensal"][f"{f}|Todos"][m][indice] for f in painel["filiais"])
        soma_canais = sum(painel["mensal"][f"Todas|{c}"][m][indice] for c in painel["canais"])
        if indice == 3:
            # clientes ativos não são somáveis: cada filial tem carteira própria,
            # então a soma das filiais é o total; entre canais, nunca menos que o total
            assert soma_filiais == total[m][3]
            assert soma_canais >= total[m][3]
        else:
            assert soma_filiais == pytest.approx(total[m][indice], abs=0.05)
            assert soma_canais == pytest.approx(total[m][indice], abs=0.05)


def test_diario_soma_o_liquido_do_mes(painel):
    for chave, por_mes in painel["diario"].items():
        for m, mes in enumerate(painel["meses"]):
            bruto, devolvido = painel["mensal"][chave][m][:2]
            diario = sum(valor for _, valor in por_mes.get(mes, []))
            assert diario == pytest.approx(bruto - devolvido, abs=0.5), (chave, mes)


def test_meta_da_empresa_e_a_soma_das_filiais(painel):
    for m in range(len(painel["meses"])):
        soma = sum(painel["metas"][f][m] for f in painel["filiais"])
        assert painel["metas"]["Todas"][m] == pytest.approx(soma)
        assert painel["metas"]["Todas"][m] > 0


def test_tops_ordenados_e_limitados(painel):
    for por_mes in painel["topProdutos"].values():
        for lista in por_mes.values():
            assert len(lista) <= transformar.TOP_PRODUTOS
            valores = [item[1] for item in lista]
            assert valores == sorted(valores, reverse=True)
            assert all(item[0] in painel["produtos"] for item in lista)


def test_mix_de_categorias_soma_o_bruto(painel):
    for chave, por_mes in painel["mixCategorias"].items():
        for m, mes in enumerate(painel["meses"]):
            assert sum(por_mes[mes]) == pytest.approx(painel["mensal"][chave][m][0], abs=0.1)


def test_devolucoes_nunca_superam_o_bruto(painel):
    for linhas in painel["mensal"].values():
        for bruto, devolvido, _, _ in linhas:
            assert 0 <= devolvido <= bruto or bruto == 0


def test_mes_corrente_e_parcial(painel):
    corte = pd.Timestamp(painel["corte"])
    assert painel["meses"][-1] == f"{corte.year}-{corte.month:02d}"
    assert corte.day < corte.days_in_month
