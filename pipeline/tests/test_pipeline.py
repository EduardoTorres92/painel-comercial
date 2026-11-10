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
    notas, devol, metas, produtos, carteira = gerar_dados.gerar(semente=42)
    notas.to_csv(pasta / "notas_itens.csv", index=False)
    devol.to_csv(pasta / "devolucoes.csv", index=False)
    metas.to_csv(pasta / "metas.csv", index=False)
    produtos.to_csv(pasta / "produtos.csv", index=False)
    carteira.to_csv(pasta / "carteira.csv", index=False)
    return (*transformar.carregar(str(pasta)), transformar.carregar_carteira(str(pasta)))


@pytest.fixture(scope="module")
def painel(brutos):
    return transformar.transformar(*brutos[:4])


@pytest.fixture(scope="module")
def abas(brutos, painel):
    notas, devol, _, produtos, carteira = brutos
    return transformar.transformar_abas(notas, devol, produtos, carteira, painel)


def test_geracao_e_deterministica(brutos):
    notas, devol, _, _, _ = brutos
    notas2, devol2, _, _, _ = gerar_dados.gerar(semente=42)
    assert len(notas) == len(notas2)
    assert notas["valor"].sum() == pytest.approx(notas2["valor"].sum())
    assert devol["valor"].sum() == pytest.approx(devol2["valor"].sum())


def test_total_geral_fecha_com_os_dados_brutos(brutos, painel):
    notas, devol, _, _, _ = brutos
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


# ---------------------------------------------------------------------------
# Dados das abas
# ---------------------------------------------------------------------------
def _cada_mes(painel):
    for chave, linhas in painel["mensal"].items():
        for m, mes in enumerate(painel["meses"]):
            yield chave, mes, linhas[m]


def test_produtos_somam_bruto_e_devolucoes(painel, abas):
    por_produto = abas["produtos.json"]["porProduto"]
    for chave, mes, (bruto, devolvido, _, _) in _cada_mes(painel):
        lista = por_produto.get(chave, {}).get(mes, [])
        assert sum(p[1] for p in lista) == pytest.approx(bruto, abs=0.5), (chave, mes)
        assert sum(p[3] for p in lista) == pytest.approx(devolvido, abs=0.5), (chave, mes)
        assert [p[1] for p in lista] == sorted((p[1] for p in lista), reverse=True)


def test_estados_somam_bruto_e_notas(painel, abas):
    por_uf = abas["clientes.json"]["porUf"]
    for chave, mes, (bruto, _, notas, _) in _cada_mes(painel):
        ufs = por_uf.get(chave, {}).get(mes, {})
        assert sum(v[0] for v in ufs.values()) == pytest.approx(bruto, abs=0.5)
        assert sum(v[1] for v in ufs.values()) == notas  # cada nota tem um só estado


def test_lead_time_e_notas_por_dia_contam_todas_as_notas(painel, abas):
    operacao = abas["operacao.json"]
    for chave, mes, (_, _, notas, _) in _cada_mes(painel):
        assert sum(operacao["leadTime"][chave][mes]) == notas
        assert sum(q for _, q in operacao["notasDia"].get(chave, {}).get(mes, [])) == notas


def test_lead_time_em_dias_uteis():
    pedido = pd.Series(pd.to_datetime(["2026-11-06", "2026-11-02", "2026-10-01"]))  # sex, seg, qui
    emissao = pd.Series(pd.to_datetime(["2026-11-09", "2026-11-02", "2026-10-30"]))
    assert transformar.lead_time_dias_uteis(pedido, emissao).tolist() == [1, 0, 5]  # fim de semana não conta; teto D+5


def test_carteira_da_empresa_e_a_soma_das_filiais(painel, abas):
    resumo = abas["operacao.json"]["carteira"]["resumo"]
    total = resumo["Todas|Todos"]
    assert total["pedidos"] > 0
    assert sum(resumo[f"{f}|Todos"]["valor"] for f in painel["filiais"]) == pytest.approx(total["valor"], abs=0.5)
    assert sum(total["porSituacao"]) == pytest.approx(total["valor"], abs=0.5)
    assert len(abas["operacao.json"]["carteira"]["pedidos"]) == total["pedidos"]


def test_motivos_somam_as_devolucoes(painel, abas):
    por_motivo = abas["devolucoes.json"]["porMotivo"]
    for chave, mes, (_, devolvido, _, _) in _cada_mes(painel):
        assert sum(por_motivo[chave][mes]["valores"]) == pytest.approx(devolvido, abs=0.5)


def test_arquivos_de_notas_fecham_com_o_mes(painel, abas):
    total = painel["mensal"]["Todas|Todos"]
    for m, mes in enumerate(painel["meses"]):
        linhas = abas[f"notas/{mes}.json"]["linhas"]
        assert len(linhas) == total[m][2]
        assert sum(l[6] for l in linhas) == pytest.approx(total[m][0], abs=0.5)
