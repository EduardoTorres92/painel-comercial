"""
Transforma os dados brutos (data/bruto/) no JSON consumido pelo painel web.

Regras de negócio aplicadas aqui (e só aqui):
- Faturamento bruto: soma do valor dos itens das notas emitidas no período.
- Devoluções: valor devolvido, contado na data da devolução.
- Cut-off do mês: notas emitidas no mês e entregues só no mês seguinte. A
  receita delas é reconhecida na entrega, então sai do mês da emissão e entra
  no seguinte (o "cut-off inicial" do mês é o cut-off do mês anterior). No mês
  em andamento o cut-off só é apurado no fechamento (fica 0).
- Faturamento líquido = bruto + cut-off inicial − cut-off − devoluções. É o
  valor comparado à meta (calculado no painel a partir da série mensal).
- Ticket médio = bruto ÷ notas emitidas.
- Clientes ativos: clientes distintos com nota no período (não é somável entre
  filtros, por isso é pré-calculado para cada combinação).

- Lead time: dias úteis (segunda a sexta) entre o pedido e a emissão da nota,
  agrupados de D+0 a D+5 (5 ou mais).
- Potencial do mês: faturamento líquido + carteira de pedidos em aberto.

Todas as métricas são calculadas para cada combinação de filtro do painel
(filial ou "Todas" × canal ou "Todos"), para que o navegador só precise ler os
números, sem recalcular regras.

Arquivos gerados em web/public/data/ (cada aba do painel carrega só o seu):
    painel.json        visão geral (indicadores, ritmo, evolução, filiais, canais)
    produtos.json      faturamento, quantidade e devolução por produto (curva ABC)
    clientes.json      faturamento por estado (UF)
    operacao.json      lead time, notas emitidas por dia e carteira de pedidos
    devolucoes.json    devoluções por motivo
    notas/AAAA-MM.json notas fiscais do mês (busca)

Uso:
    python pipeline/transformar.py [--entrada data/bruto] [--saida web/public/data]
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os

import numpy as np
import pandas as pd

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TODAS, TODOS = "Todas", "Todos"
TOP_PRODUTOS, TOP_CLIENTES = 10, 8


def carregar(entrada: str):
    notas = pd.read_csv(os.path.join(entrada, "notas_itens.csv"), parse_dates=["data_emissao"])
    if "data_entrega" in notas:
        notas["data_entrega"] = pd.to_datetime(notas["data_entrega"])
    devol = pd.read_csv(os.path.join(entrada, "devolucoes.csv"), parse_dates=["data_devolucao"])
    metas = pd.read_csv(os.path.join(entrada, "metas.csv"))
    produtos = pd.read_csv(os.path.join(entrada, "produtos.csv"))
    notas["mes"] = notas["data_emissao"].dt.to_period("M").astype(str)
    devol["mes"] = devol["data_devolucao"].dt.to_period("M").astype(str)
    return notas, devol, metas, produtos


def carregar_carteira(entrada: str) -> pd.DataFrame:
    caminho = os.path.join(entrada, "carteira.csv")
    if not os.path.exists(caminho):
        return pd.DataFrame(columns=["pedido", "filial", "canal", "cliente", "uf", "data_pedido",
                                     "entrega_prevista", "situacao", "valor"])
    return pd.read_csv(caminho)


def _com_totais(df: pd.DataFrame) -> pd.DataFrame:
    """Replica as linhas com filial = "Todas" e/ou canal = "Todos" (as 4 combinações)."""
    return pd.concat(
        [
            df,
            df.assign(filial=TODAS),
            df.assign(canal=TODOS),
            df.assign(filial=TODAS, canal=TODOS),
        ],
        ignore_index=True,
    )


def _chave(filial: str, canal: str) -> str:
    return f"{filial}|{canal}"


def _arred(valor: float) -> float:
    return round(float(valor), 2)


def cutoff_por_mes(n: pd.DataFrame, corte: dt.date) -> pd.Series:
    """
    Valor das notas emitidas no mês e entregues depois do último dia dele, por
    filial × canal × mês. Meses ainda não fechados no corte ficam de fora.
    """
    if "data_entrega" not in n:
        return pd.Series(dtype=float)
    emissao = n["data_emissao"].dt.to_period("M")
    fechado = (emissao.dt.end_time.dt.date <= corte)
    sel = n[(n["data_entrega"].dt.to_period("M") > emissao) & fechado]
    return sel.groupby(["filial", "canal", "mes"])["valor"].sum()


def transformar(notas: pd.DataFrame, devol: pd.DataFrame, metas: pd.DataFrame, produtos: pd.DataFrame) -> dict:
    filiais = sorted(notas["filial"].unique())
    canais = list(notas.groupby("canal")["valor"].sum().sort_values(ascending=False).index)
    meses = sorted(notas["mes"].unique())
    corte = notas["data_emissao"].max().date()
    combinacoes = [(f, c) for f in [TODAS, *filiais] for c in [TODOS, *canais]]

    n = _com_totais(notas)
    d = _com_totais(devol)
    chaves = ["filial", "canal", "mes"]

    bruto = n.groupby(chaves)["valor"].sum()
    devolvido = d.groupby(chaves)["valor"].sum()
    qtd_notas = n.groupby(chaves)["nota_fiscal"].nunique()
    clientes = n.groupby(chaves)["cliente"].nunique()
    cutoff = cutoff_por_mes(n, corte)

    mensal = {}
    for filial, canal in combinacoes:
        linhas = []
        for mes in meses:
            k = (filial, canal, mes)
            linhas.append([
                _arred(bruto.get(k, 0.0)),
                _arred(devolvido.get(k, 0.0)),
                int(qtd_notas.get(k, 0)),
                int(clientes.get(k, 0)),
                _arred(cutoff.get(k, 0.0)),
            ])
        mensal[_chave(filial, canal)] = linhas

    # Líquido por dia (para o ritmo do mês): bruto do dia − devoluções do dia
    n["dia"] = n["data_emissao"].dt.day
    d["dia"] = d["data_devolucao"].dt.day
    bruto_dia = n.groupby([*chaves, "dia"])["valor"].sum()
    devol_dia = d.groupby([*chaves, "dia"])["valor"].sum()
    liquido_dia = bruto_dia.sub(devol_dia, fill_value=0.0)
    diario: dict[str, dict[str, list]] = {}
    for (filial, canal, mes, dia), valor in liquido_dia.items():
        diario.setdefault(_chave(filial, canal), {}).setdefault(mes, []).append([int(dia), _arred(valor)])

    # Top produtos e clientes por combinação e mês
    por_produto = n.groupby([*chaves, "produto"]).agg(valor=("valor", "sum"), quantidade=("quantidade", "sum"))
    por_cliente = n.groupby([*chaves, "cliente"]).agg(valor=("valor", "sum"), notas=("nota_fiscal", "nunique"))
    top_produtos: dict[str, dict[str, list]] = {}
    for (filial, canal, mes), grupo in por_produto.groupby(level=[0, 1, 2]):
        top = grupo.sort_values("valor", ascending=False).head(TOP_PRODUTOS)
        top_produtos.setdefault(_chave(filial, canal), {})[mes] = [
            [idx[-1], _arred(lin.valor), int(lin.quantidade)] for idx, lin in top.iterrows()
        ]
    top_clientes: dict[str, dict[str, list]] = {}
    for (filial, canal, mes), grupo in por_cliente.groupby(level=[0, 1, 2]):
        top = grupo.sort_values("valor", ascending=False).head(TOP_CLIENTES)
        top_clientes.setdefault(_chave(filial, canal), {})[mes] = [
            [idx[-1], _arred(lin.valor), int(lin.notas)] for idx, lin in top.iterrows()
        ]

    # Mix por categoria
    n = n.merge(produtos[["produto", "categoria"]], on="produto", how="left")
    categorias = list(n[n["filial"].eq(TODAS) & n["canal"].eq(TODOS)]
                      .groupby("categoria")["valor"].sum().sort_values(ascending=False).index)
    por_categoria = n.groupby([*chaves, "categoria"])["valor"].sum()
    mix: dict[str, dict[str, list]] = {}
    for filial, canal in combinacoes:
        for mes in meses:
            mix.setdefault(_chave(filial, canal), {})[mes] = [
                _arred(por_categoria.get((filial, canal, mes, cat), 0.0)) for cat in categorias
            ]

    # Metas por filial (a meta da empresa é a soma das filiais); não há meta por canal
    meta = metas.pivot_table(index="mes", columns="filial", values="meta", aggfunc="sum").reindex(meses).fillna(0)
    meta[TODAS] = meta[filiais].sum(axis=1)
    metas_json = {filial: [_arred(v) for v in meta[filial]] for filial in [TODAS, *filiais]}

    return {
        "versao": 1,
        "empresa": "Grão Norte Distribuidora",
        "aviso": "Dados fictícios gerados por pipeline/gerar_dados.py",
        "geradoEm": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "corte": corte.isoformat(),
        "filiais": filiais,
        "canais": canais,
        "meses": meses,
        "categorias": categorias,
        "produtos": {
            linha.produto: [linha.descricao, linha.categoria] for linha in produtos.itertuples()
        },
        "mensal": mensal,
        "metas": metas_json,
        "diario": diario,
        "topProdutos": top_produtos,
        "topClientes": top_clientes,
        "mixCategorias": mix,
    }


# ---------------------------------------------------------------------------
# Dados das abas (carregados sob demanda pelo painel)
# ---------------------------------------------------------------------------
D_MAX = 5  # lead time: D+5 agrupa "5 dias úteis ou mais"


def lead_time_dias_uteis(pedido: pd.Series, emissao: pd.Series) -> pd.Series:
    """Dias úteis (seg–sex) entre o pedido e a emissão, limitado a D+5."""
    dias = np.busday_count(pedido.values.astype("datetime64[D]"), emissao.values.astype("datetime64[D]"))
    return pd.Series(np.clip(dias, 0, D_MAX), index=pedido.index)


def transformar_abas(notas, devol, produtos, carteira, painel: dict) -> dict[str, object]:
    """Monta os JSONs das abas. Devolve {caminho relativo: conteúdo}."""
    filiais, canais, meses = painel["filiais"], painel["canais"], painel["meses"]
    combinacoes = [(f, c) for f in [TODAS, *filiais] for c in [TODOS, *canais]]
    chaves = ["filial", "canal", "mes"]
    n = _com_totais(notas)
    d = _com_totais(devol)

    # ---- Produtos: valor, quantidade e devolução por produto (base da curva ABC)
    vendido = n.groupby([*chaves, "produto"]).agg(valor=("valor", "sum"), quantidade=("quantidade", "sum"))
    devolvido = d.groupby([*chaves, "produto"])["valor"].sum()
    tabela = vendido.join(devolvido.rename("devolvido"), how="outer").fillna(0.0)
    por_produto: dict[str, dict[str, list]] = {}
    for (filial, canal, mes, produto), linha in tabela.iterrows():
        por_produto.setdefault(_chave(filial, canal), {}).setdefault(mes, []).append(
            [produto, _arred(linha.valor), int(linha.quantidade), _arred(linha.devolvido)]
        )
    for por_mes in por_produto.values():
        for lista in por_mes.values():
            lista.sort(key=lambda item: -item[1])

    # ---- Clientes: faturamento, notas e clientes por UF
    uf = n.groupby([*chaves, "uf"]).agg(
        valor=("valor", "sum"), notas=("nota_fiscal", "nunique"), clientes=("cliente", "nunique")
    )
    por_uf: dict[str, dict[str, dict]] = {}
    for (filial, canal, mes, sigla), linha in uf.iterrows():
        por_uf.setdefault(_chave(filial, canal), {}).setdefault(mes, {})[sigla] = [
            _arred(linha.valor), int(linha.notas), int(linha.clientes)
        ]

    # ---- Operação: lead time (uma contagem por nota), notas por dia e carteira
    cabecalho = notas.drop_duplicates("nota_fiscal")[["nota_fiscal", "data_emissao", "data_pedido", "filial", "canal", "mes"]].copy()
    cabecalho["d"] = lead_time_dias_uteis(pd.to_datetime(cabecalho["data_pedido"]), cabecalho["data_emissao"])
    cabecalho["dia"] = cabecalho["data_emissao"].dt.day
    c = _com_totais(cabecalho)
    lead = c.groupby([*chaves, "d"]).size()
    lead_time = {
        _chave(filial, canal): {
            mes: [int(lead.get((filial, canal, mes, dd), 0)) for dd in range(D_MAX + 1)] for mes in meses
        }
        for filial, canal in combinacoes
    }
    por_dia = c.groupby([*chaves, "dia"]).size()
    notas_dia: dict[str, dict[str, list]] = {}
    for (filial, canal, mes, dia), qtd in por_dia.items():
        notas_dia.setdefault(_chave(filial, canal), {}).setdefault(mes, []).append([int(dia), int(qtd)])

    situacoes = ["Liberado", "Em separação", "Aguardando estoque", "Bloqueio de crédito"]
    k = _com_totais(carteira) if len(carteira) else carteira
    carteira_resumo = {}
    for filial, canal in combinacoes:
        sel = k[(k["filial"] == filial) & (k["canal"] == canal)] if len(k) else k
        carteira_resumo[_chave(filial, canal)] = {
            "valor": _arred(sel["valor"].sum()) if len(sel) else 0.0,
            "pedidos": int(len(sel)),
            "porSituacao": [_arred(sel.loc[sel["situacao"] == s_, "valor"].sum()) if len(sel) else 0.0 for s_ in situacoes],
        }
    pedidos = [
        [l.pedido, filiais.index(l.filial), canais.index(l.canal), l.cliente, l.uf,
         str(l.data_pedido), str(l.entrega_prevista), situacoes.index(l.situacao), _arred(l.valor)]
        for l in carteira.sort_values("valor", ascending=False).itertuples()
    ]

    # ---- Devoluções por motivo
    motivos = list(devol.groupby("motivo")["valor"].sum().sort_values(ascending=False).index) if "motivo" in devol else []
    por_motivo_serie = d.groupby([*chaves, "motivo"])["valor"].sum() if motivos else pd.Series(dtype=float)
    notas_devolvidas = d.groupby(chaves)["nota_origem"].nunique()
    por_motivo = {
        _chave(filial, canal): {
            mes: {
                "valores": [_arred(por_motivo_serie.get((filial, canal, mes, m_), 0.0)) for m_ in motivos],
                "notas": int(notas_devolvidas.get((filial, canal, mes), 0)),
            }
            for mes in meses
        }
        for filial, canal in combinacoes
    }

    # ---- Notas fiscais por mês (busca): uma linha por nota
    devolvido_nf = devol.groupby("nota_origem")["valor"].sum()
    resumo_nf = notas.groupby("nota_fiscal").agg(
        data=("data_emissao", "first"), pedido=("data_pedido", "first"), filial=("filial", "first"),
        canal=("canal", "first"), cliente=("cliente", "first"), uf=("uf", "first"),
        valor=("valor", "sum"), itens=("produto", "count"), mes=("mes", "first"),
    )
    resumo_nf["devolvido"] = devolvido_nf.reindex(resumo_nf.index).fillna(0.0)
    arquivos_notas = {}
    for mes, grupo in resumo_nf.groupby("mes"):
        arquivos_notas[f"notas/{mes}.json"] = {
            "colunas": ["nota", "dia", "filial", "canal", "cliente", "uf", "valor", "itens", "devolvido"],
            "linhas": [
                [int(nf), int(l.data.day), filiais.index(l.filial), canais.index(l.canal), l.cliente, l.uf,
                 _arred(l.valor), int(l.itens), _arred(l.devolvido)]
                for nf, l in grupo.sort_values("data").iterrows()
            ],
        }

    return {
        "produtos.json": {"porProduto": por_produto},
        "clientes.json": {"porUf": por_uf},
        "operacao.json": {
            "leadTime": lead_time,
            "notasDia": notas_dia,
            "carteira": {"situacoes": situacoes, "resumo": carteira_resumo, "pedidos": pedidos},
        },
        "devolucoes.json": {"motivos": motivos, "porMotivo": por_motivo},
        **arquivos_notas,
    }


def _gravar(pasta: str, nome: str, conteudo) -> int:
    caminho = os.path.join(pasta, nome)
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as arquivo:
        json.dump(conteudo, arquivo, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(caminho)


def main():
    parser = argparse.ArgumentParser(description="Gera os JSONs do painel a partir dos dados brutos.")
    parser.add_argument("--entrada", default=os.path.join(RAIZ, "data", "bruto"))
    parser.add_argument("--saida", default=os.path.join(RAIZ, "web", "public", "data"))
    args = parser.parse_args()

    notas, devol, metas, produtos = carregar(args.entrada)
    painel = transformar(notas, devol, metas, produtos)
    abas = transformar_abas(notas, devol, produtos, carregar_carteira(args.entrada), painel)

    tamanhos = {"painel.json": _gravar(args.saida, "painel.json", painel)}
    for nome, conteudo in abas.items():
        tamanhos[nome] = _gravar(args.saida, nome, conteudo)
    total = sum(tamanhos.values()) / 1024
    print(f"{len(painel['meses'])} meses · {len(painel['mensal'])} combinações de filtro · "
          f"{len(tamanhos)} arquivos ({total:,.0f} KB) → {os.path.relpath(args.saida, RAIZ)}")
    for nome in ["painel.json", "produtos.json", "clientes.json", "operacao.json", "devolucoes.json"]:
        print(f"  {nome:<16} {tamanhos[nome] / 1024:>6,.0f} KB")


if __name__ == "__main__":
    main()
