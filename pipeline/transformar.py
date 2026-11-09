"""
Transforma os dados brutos (data/bruto/) no JSON consumido pelo painel web.

Regras de negócio aplicadas aqui (e só aqui):
- Faturamento bruto: soma do valor dos itens das notas emitidas no período.
- Devoluções: valor devolvido, contado na data da devolução.
- Faturamento líquido = bruto − devoluções. É o valor comparado à meta.
- Ticket médio = bruto ÷ notas emitidas.
- Clientes ativos: clientes distintos com nota no período (não é somável entre
  filtros, por isso é pré-calculado para cada combinação).

Todas as métricas são calculadas para cada combinação de filtro do painel
(filial ou "Todas" × canal ou "Todos"), para que o navegador só precise ler os
números, sem recalcular regras.

Uso:
    python pipeline/transformar.py [--entrada data/bruto] [--saida web/public/data/painel.json]
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os

import pandas as pd

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TODAS, TODOS = "Todas", "Todos"
TOP_PRODUTOS, TOP_CLIENTES = 10, 8


def carregar(entrada: str):
    notas = pd.read_csv(os.path.join(entrada, "notas_itens.csv"), parse_dates=["data_emissao"])
    devol = pd.read_csv(os.path.join(entrada, "devolucoes.csv"), parse_dates=["data_devolucao"])
    metas = pd.read_csv(os.path.join(entrada, "metas.csv"))
    produtos = pd.read_csv(os.path.join(entrada, "produtos.csv"))
    notas["mes"] = notas["data_emissao"].dt.to_period("M").astype(str)
    devol["mes"] = devol["data_devolucao"].dt.to_period("M").astype(str)
    return notas, devol, metas, produtos


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


def main():
    parser = argparse.ArgumentParser(description="Gera o JSON do painel a partir dos dados brutos.")
    parser.add_argument("--entrada", default=os.path.join(RAIZ, "data", "bruto"))
    parser.add_argument("--saida", default=os.path.join(RAIZ, "web", "public", "data", "painel.json"))
    args = parser.parse_args()

    painel = transformar(*carregar(args.entrada))
    os.makedirs(os.path.dirname(args.saida), exist_ok=True)
    with open(args.saida, "w", encoding="utf-8") as arquivo:
        json.dump(painel, arquivo, ensure_ascii=False, separators=(",", ":"))
    tamanho = os.path.getsize(args.saida) / 1024
    print(f"{len(painel['meses'])} meses · {len(painel['mensal'])} combinações de filtro · "
          f"{tamanho:,.0f} KB → {os.path.relpath(args.saida, RAIZ)}")


if __name__ == "__main__":
    main()
