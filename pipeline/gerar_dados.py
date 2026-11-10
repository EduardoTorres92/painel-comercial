"""
Gera os dados brutos de uma distribuidora fictícia, no formato de um ERP.

Grão Norte Distribuidora (empresa inventada): cafés, chás e itens para
cafeteria, com 4 filiais e 5 canais de venda. Os dados são sintéticos, mas
seguem padrões realistas para o painel ter o que mostrar:

- sazonalidade (inverno e fim de ano vendem mais) e crescimento ao longo do tempo;
- dias úteis com movimento e sábados fracos;
- mix de canal e de produto diferente por filial;
- devoluções parciais ou totais (~2,5% do valor), alguns dias depois da venda;
- metas mensais por filial, nem sempre atingidas;
- estado (UF) do cliente, data do pedido (para o lead time), motivo das
  devoluções e uma carteira de pedidos em aberto no dia do corte.

Tudo é determinístico (semente fixa): rodar de novo gera exatamente os mesmos
arquivos.

Saída (pasta data/bruto/):
    notas_itens.csv   uma linha por item de nota fiscal
    devolucoes.csv    itens devolvidos, referenciando a nota de origem (com motivo)
    carteira.csv      pedidos em aberto no dia do corte (potencial do mês)
    metas.csv         meta de faturamento por filial e mês
    produtos.csv      cadastro de produtos

Uso:
    python pipeline/gerar_dados.py [--saida data/bruto] [--semente 42]
"""

from __future__ import annotations

import argparse
import datetime as dt
import os

import numpy as np
import pandas as pd

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

INICIO = dt.date(2025, 1, 1)
CORTE = dt.date(2026, 11, 6)  # último dia com dados: o mês corrente fica parcial

# Filial: (pedidos por dia útil no início da série, crescimento ao mês, mix de canais)
FILIAIS = {
    "Belo Horizonte": (34, 0.010, [0.34, 0.24, 0.24, 0.13, 0.05]),
    "Recife": (22, 0.016, [0.30, 0.32, 0.18, 0.18, 0.02]),
    "Curitiba": (27, 0.006, [0.26, 0.22, 0.32, 0.14, 0.06]),
    "Goiânia": (15, 0.022, [0.42, 0.26, 0.14, 0.16, 0.02]),
}
CANAIS = ["Atacado", "Varejo", "Food Service", "E-commerce", "Exportação"]

# Itens por nota e multiplicador de quantidade por canal
PERFIL_CANAL = {
    "Atacado": {"itens": (2, 7), "quantidade": 18, "desconto": 0.12},
    "Varejo": {"itens": (2, 6), "quantidade": 6, "desconto": 0.05},
    "Food Service": {"itens": (1, 5), "quantidade": 9, "desconto": 0.08},
    "E-commerce": {"itens": (1, 4), "quantidade": 2, "desconto": 0.0},
    "Exportação": {"itens": (1, 3), "quantidade": 24, "desconto": 0.15},
}

# Sazonalidade por mês (1 = média)
SAZONALIDADE = {1: 0.92, 2: 0.88, 3: 0.97, 4: 0.98, 5: 1.04, 6: 1.12,
                7: 1.16, 8: 1.10, 9: 1.00, 10: 0.98, 11: 1.03, 12: 1.14}

# (código, nome, categoria, preço unitário, peso por canal: Atacado, Varejo, Food Service, E-commerce, Exportação)
PRODUTOS = [
    ("GR-001", "Café em grãos Catuaí 1 kg", "Café em grãos", 89.0, [5, 3, 6, 3, 8]),
    ("GR-002", "Café em grãos Bourbon Amarelo 1 kg", "Café em grãos", 112.0, [3, 2, 5, 3, 9]),
    ("GR-003", "Café em grãos Blend da Casa 1 kg", "Café em grãos", 74.0, [7, 3, 8, 2, 4]),
    ("GR-004", "Café em grãos Descafeinado 500 g", "Café em grãos", 58.0, [1, 2, 2, 2, 1]),
    ("GR-005", "Café em grãos Microlote Serra 250 g", "Café em grãos", 46.0, [1, 3, 1, 6, 3]),
    ("MO-001", "Café moído Tradicional 500 g", "Café moído", 24.9, [9, 9, 3, 3, 1]),
    ("MO-002", "Café moído Extraforte 500 g", "Café moído", 26.5, [8, 8, 3, 2, 1]),
    ("MO-003", "Café moído Gourmet 250 g", "Café moído", 21.9, [3, 6, 2, 5, 1]),
    ("MO-004", "Café moído Orgânico 250 g", "Café moído", 27.9, [2, 4, 1, 5, 2]),
    ("MO-005", "Café moído Para Coador 1 kg", "Café moído", 44.0, [5, 3, 5, 1, 0]),
    ("CA-001", "Cápsulas Espresso Intenso (10 un.)", "Cápsulas", 22.0, [3, 6, 1, 9, 2]),
    ("CA-002", "Cápsulas Lungo Suave (10 un.)", "Cápsulas", 22.0, [2, 5, 1, 8, 1]),
    ("CA-003", "Cápsulas Descafeinado (10 un.)", "Cápsulas", 23.5, [1, 3, 1, 5, 1]),
    ("CA-004", "Cápsulas Cappuccino (10 un.)", "Cápsulas", 26.0, [2, 5, 1, 7, 1]),
    ("CH-001", "Chá Verde (20 sachês)", "Chás", 14.5, [3, 4, 3, 3, 1]),
    ("CH-002", "Chá de Camomila (20 sachês)", "Chás", 13.9, [3, 4, 3, 3, 1]),
    ("CH-003", "Chá Mate Tostado 250 g", "Chás", 17.9, [4, 4, 2, 2, 1]),
    ("CH-004", "Chá Preto Earl Grey (20 sachês)", "Chás", 19.5, [1, 3, 2, 4, 1]),
    ("AC-001", "Açúcar Demerara 1 kg", "Açúcar e adoçantes", 9.9, [7, 5, 6, 1, 0]),
    ("AC-002", "Sachê de Açúcar (1.000 un.)", "Açúcar e adoçantes", 49.0, [5, 1, 9, 1, 0]),
    ("AC-003", "Adoçante Stevia 100 ml", "Açúcar e adoçantes", 15.9, [3, 4, 3, 3, 0]),
    ("LE-001", "Leite em pó Integral 400 g", "Lácteos", 21.5, [5, 4, 6, 1, 0]),
    ("LE-002", "Bebida de Aveia Barista 1 L", "Lácteos", 18.9, [2, 3, 7, 3, 0]),
    ("LE-003", "Chantilly Spray 250 g", "Lácteos", 16.5, [2, 2, 6, 1, 0]),
    ("CO-001", "Copo de Papel 180 ml (100 un.)", "Descartáveis", 19.9, [6, 2, 9, 1, 0]),
    ("CO-002", "Mexedor de Madeira (500 un.)", "Descartáveis", 12.5, [5, 1, 8, 1, 0]),
    ("CO-003", "Tampa para Copo (100 un.)", "Descartáveis", 14.9, [4, 1, 8, 1, 0]),
    ("EQ-001", "Moedor Manual Cerâmico", "Acessórios", 189.0, [1, 2, 1, 5, 1]),
    ("EQ-002", "Prensa Francesa 600 ml", "Acessórios", 129.0, [1, 3, 1, 5, 1]),
    ("EQ-003", "Filtro de Papel 103 (30 un.)", "Acessórios", 8.9, [6, 8, 4, 4, 0]),
    ("EQ-004", "Chaleira Bico de Ganso 1 L", "Acessórios", 249.0, [1, 1, 2, 4, 1]),
    ("EQ-005", "Balança Digital para Café", "Acessórios", 159.0, [1, 1, 2, 3, 1]),
]

PREFIXOS_CLIENTE = {
    "Atacado": ["Distribuidora", "Atacadão", "Comercial", "Central de Compras"],
    "Varejo": ["Empório", "Supermercado", "Mercado", "Mercearia", "Delicatessen"],
    "Food Service": ["Cafeteria", "Padaria", "Restaurante", "Hotel", "Confeitaria"],
    "E-commerce": ["Pedido online"],
    "Exportação": ["Importadora", "Trading"],
}
NOMES_CLIENTE = [
    "Aurora", "Bom Grão", "Serra Azul", "Ponto Certo", "Sabor da Terra", "Estrela",
    "Boa Vista", "Primavera", "Horizonte", "Ipê Amarelo", "Rio Claro", "Pé de Serra",
    "Jardim", "Vila Nova", "Recanto", "Bela Manhã", "Do Largo", "Santa Clara",
    "Monte Verde", "Cruzeiro", "Lua Cheia", "Bem-Te-Vi", "Três Irmãos", "Esquina",
]
PAISES = ["Portugal", "Chile", "Alemanha", "Japão", "Estados Unidos", "Uruguai"]

# Estado de cada filial e estados vizinhos atendidos por ela
UF_FILIAL = {
    "Belo Horizonte": ("MG", ["ES", "RJ", "SP", "BA", "GO", "DF"]),
    "Recife": ("PE", ["PB", "AL", "RN", "CE", "BA", "SE", "PI", "MA"]),
    "Curitiba": ("PR", ["SC", "RS", "SP", "MS"]),
    "Goiânia": ("GO", ["DF", "TO", "MT", "MS", "MG", "PA"]),
}
UFS_ECOMMERCE = ["SP", "RJ", "MG", "PR", "RS", "SC", "BA", "PE", "GO", "DF", "CE", "ES", "PA", "AM", "MT", "MS"]
PESOS_ECOMMERCE = [22, 11, 12, 7, 6, 5, 5, 4, 4, 4, 3, 3, 2, 2, 2, 2]

# Lead time (dias úteis entre pedido e emissão da nota): probabilidade de D+0 a D+5 por filial
LEAD_TIME = {
    "Belo Horizonte": [0.22, 0.38, 0.22, 0.10, 0.05, 0.03],
    "Recife": [0.10, 0.28, 0.28, 0.17, 0.10, 0.07],
    "Curitiba": [0.30, 0.40, 0.17, 0.07, 0.04, 0.02],
    "Goiânia": [0.12, 0.30, 0.27, 0.15, 0.10, 0.06],
}

MOTIVOS_DEVOLUCAO = ["Avaria no transporte", "Produto errado", "Validade próxima", "Desistência do cliente", "Preço divergente"]
PESOS_MOTIVOS = [0.34, 0.22, 0.18, 0.16, 0.10]

STATUS_CARTEIRA = ["Liberado", "Em separação", "Aguardando estoque", "Bloqueio de crédito"]
PESOS_STATUS = [0.45, 0.30, 0.15, 0.10]

TAXA_DEVOLUCAO = 0.045  # chance de um item ser devolvido (parcial ou total)


def _dias_uteis(ano: int, mes: int) -> list[dt.date]:
    dia = dt.date(ano, mes, 1)
    dias = []
    while dia.month == mes:
        if dia.weekday() < 6:  # segunda a sábado
            dias.append(dia)
        dia += dt.timedelta(days=1)
    return dias


def _menos_dias_uteis(dia: dt.date, n: int) -> dt.date:
    """Volta `n` dias úteis (segunda a sexta)."""
    while n > 0:
        dia -= dt.timedelta(days=1)
        if dia.weekday() < 5:
            n -= 1
    return dia


def _uf_cliente(rng: np.random.Generator, filial: str, canal: str) -> str:
    if canal == "Exportação":
        return "EX"
    casa, vizinhos = UF_FILIAL[filial]
    return casa if rng.random() < 0.68 else str(rng.choice(vizinhos))


def _clientes(rng: np.random.Generator) -> dict[tuple[str, str], list[str]]:
    """Carteira de clientes por (filial, canal)."""
    carteira = {}
    for filial in FILIAIS:
        for canal in CANAIS:
            if canal == "E-commerce":
                carteira[(filial, canal)] = [f"Consumidor final {filial}"]
                continue
            tamanho = {"Atacado": 18, "Varejo": 45, "Food Service": 60, "Exportação": 6}[canal]
            nomes = set()
            while len(nomes) < tamanho:
                if canal == "Exportação":
                    nome = f"{rng.choice(PREFIXOS_CLIENTE[canal])} {rng.choice(NOMES_CLIENTE)} ({rng.choice(PAISES)})"
                else:
                    nome = f"{rng.choice(PREFIXOS_CLIENTE[canal])} {rng.choice(NOMES_CLIENTE)} – {filial}"
                nomes.add(nome)
            carteira[(filial, canal)] = sorted(nomes)
    return carteira


def gerar(semente: int = 42):
    rng = np.random.default_rng(semente)
    # Gerador separado para os campos complementares (UF, pedido, motivo, carteira):
    # assim eles não alteram a sequência que produz vendas, devoluções e metas.
    extra = np.random.default_rng(semente + 1)
    carteira = _clientes(rng)
    uf_de = {
        cliente: _uf_cliente(extra, filial, canal)
        for (filial, canal), clientes in carteira.items()
        for cliente in clientes
    }
    codigos = [p[0] for p in PRODUTOS]
    precos = np.array([p[3] for p in PRODUTOS])
    pesos_canal = {
        canal: np.array([p[4][i] for p in PRODUTOS], dtype=float) / sum(p[4][i] for p in PRODUTOS)
        for i, canal in enumerate(CANAIS)
    }

    itens, devolucoes, metas = [], [], []
    numero_nf = 100_000
    meses = pd.period_range(INICIO, CORTE, freq="M")

    for indice_mes, periodo in enumerate(meses):
        sazonal = SAZONALIDADE[periodo.month]
        dias = [d for d in _dias_uteis(periodo.year, periodo.month) if INICIO <= d <= CORTE]

        for filial, (base, crescimento, mix) in FILIAIS.items():
            esperado_mes = 0.0
            for dia in dias:
                fator_dia = 0.35 if dia.weekday() == 5 else 1.0
                media = base * sazonal * (1 + crescimento) ** indice_mes * fator_dia
                for _ in range(rng.poisson(media)):
                    numero_nf += 1
                    canal = CANAIS[rng.choice(len(CANAIS), p=mix)]
                    perfil = PERFIL_CANAL[canal]
                    cliente = rng.choice(carteira[(filial, canal)])
                    uf = (str(extra.choice(UFS_ECOMMERCE, p=np.array(PESOS_ECOMMERCE) / sum(PESOS_ECOMMERCE)))
                          if canal == "E-commerce" else uf_de[cliente])
                    data_pedido = _menos_dias_uteis(dia, int(extra.choice(6, p=LEAD_TIME[filial])))
                    n_itens = rng.integers(*perfil["itens"])
                    escolhidos = rng.choice(len(PRODUTOS), size=n_itens, replace=False, p=pesos_canal[canal])
                    for idx in escolhidos:
                        quantidade = max(1, int(rng.gamma(2.0, perfil["quantidade"] / 2)))
                        preco = precos[idx] * (1 - perfil["desconto"]) * rng.uniform(0.97, 1.03)
                        valor = round(quantidade * preco, 2)
                        esperado_mes += valor
                        itens.append((numero_nf, dia, data_pedido, filial, canal, cliente, uf, codigos[idx], quantidade, valor))

                        if rng.random() < TAXA_DEVOLUCAO:
                            parte = rng.choice([0.25, 0.5, 1.0], p=[0.4, 0.35, 0.25])
                            qtd_dev = max(1, int(round(quantidade * parte)))
                            data_dev = min(dia + dt.timedelta(days=int(rng.integers(3, 21))), CORTE)
                            motivo = str(extra.choice(MOTIVOS_DEVOLUCAO, p=PESOS_MOTIVOS))
                            devolucoes.append((numero_nf, data_dev, filial, canal, cliente, codigos[idx],
                                               qtd_dev, round(valor * qtd_dev / quantidade, 2), motivo))

            # Meta: o que a filial "deveria" vender no mês inteiro, com um desafio de 3% a 9%
            dias_mes = _dias_uteis(periodo.year, periodo.month)
            uteis_cheios = sum(0.35 if d.weekday() == 5 else 1.0 for d in dias_mes)
            uteis_ate_corte = sum(0.35 if d.weekday() == 5 else 1.0 for d in dias) or 1
            projecao = esperado_mes * uteis_cheios / uteis_ate_corte
            desafio = rng.uniform(0.94, 1.10)  # há meses de meta folgada e meses de meta difícil
            metas.append((str(periodo), filial, round(projecao * desafio, -3)))

    colunas = ["nota_fiscal", "data_emissao", "data_pedido", "filial", "canal", "cliente", "uf",
               "produto", "quantidade", "valor"]
    notas = pd.DataFrame(itens, columns=colunas)
    devol = pd.DataFrame(devolucoes, columns=["nota_origem", "data_devolucao", "filial", "canal", "cliente",
                                              "produto", "quantidade", "valor", "motivo"])
    metas_df = pd.DataFrame(metas, columns=["mes", "filial", "meta"])
    produtos = pd.DataFrame([p[:4] for p in PRODUTOS], columns=["produto", "descricao", "categoria", "preco_tabela"])
    pedidos = _carteira(extra, carteira, uf_de, precos, pesos_canal, len(meses) - 1)
    return notas, devol, metas_df, produtos, pedidos


def _carteira(extra, carteira, uf_de, precos, pesos_canal, indice_mes) -> pd.DataFrame:
    """
    Pedidos em aberto no dia do corte, com entrega prevista até o fim do mês:
    cerca de 60% do que a filial ainda deve faturar no mês, em situações variadas.
    """
    periodo = pd.Period(CORTE, freq="M")
    restantes = [d for d in _dias_uteis(periodo.year, periodo.month) if d > CORTE]
    linhas, numero = [], 900_000
    for filial, (base, crescimento, mix) in FILIAIS.items():
        uteis = sum(0.35 if d.weekday() == 5 else 1.0 for d in restantes)
        quantidade_pedidos = extra.poisson(base * SAZONALIDADE[periodo.month] * (1 + crescimento) ** indice_mes * uteis * 0.6)
        for _ in range(quantidade_pedidos):
            numero += 1
            canal = CANAIS[extra.choice(len(CANAIS), p=mix)]
            perfil = PERFIL_CANAL[canal]
            cliente = str(extra.choice(carteira[(filial, canal)]))
            uf = uf_de[cliente] if canal != "E-commerce" else "SP"
            itens = extra.choice(len(PRODUTOS), size=extra.integers(*perfil["itens"]), replace=False, p=pesos_canal[canal])
            valor = sum(
                max(1, int(extra.gamma(2.0, perfil["quantidade"] / 2))) * precos[i] * (1 - perfil["desconto"])
                for i in itens
            )
            linhas.append((
                f"PV-{numero}", filial, canal, cliente, uf,
                _menos_dias_uteis(CORTE, int(extra.integers(0, 6))),
                restantes[int(extra.integers(len(restantes)))],
                str(extra.choice(STATUS_CARTEIRA, p=PESOS_STATUS)),
                round(float(valor), 2),
            ))
    return pd.DataFrame(linhas, columns=["pedido", "filial", "canal", "cliente", "uf", "data_pedido",
                                         "entrega_prevista", "situacao", "valor"])


def main():
    parser = argparse.ArgumentParser(description="Gera os dados brutos fictícios da Grão Norte Distribuidora.")
    parser.add_argument("--saida", default=os.path.join(RAIZ, "data", "bruto"))
    parser.add_argument("--semente", type=int, default=42)
    args = parser.parse_args()

    notas, devol, metas, produtos, pedidos = gerar(args.semente)
    os.makedirs(args.saida, exist_ok=True)
    pedidos.to_csv(os.path.join(args.saida, "carteira.csv"), index=False)
    notas.to_csv(os.path.join(args.saida, "notas_itens.csv"), index=False)
    devol.to_csv(os.path.join(args.saida, "devolucoes.csv"), index=False)
    metas.to_csv(os.path.join(args.saida, "metas.csv"), index=False)
    produtos.to_csv(os.path.join(args.saida, "produtos.csv"), index=False)
    print(f"{notas['nota_fiscal'].nunique():,} notas · {len(notas):,} itens · "
          f"{len(devol):,} devoluções · {len(metas)} metas · {len(pedidos):,} pedidos em carteira "
          f"→ {os.path.relpath(args.saida, RAIZ)}")


if __name__ == "__main__":
    main()
