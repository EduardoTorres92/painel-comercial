import { describe, expect, it } from "vitest";
import {
  buscarNotas,
  curvaAbc,
  notasAcumuladas,
  notasParaCsv,
  potencialPorFilial,
  produtosMaisDevolvidos,
  resumoLeadTime,
  taxaDevolucaoPor,
} from "../src/lib/analises";
import type { DadosNotas, DadosOperacao, DadosProdutos, Painel } from "../src/lib/tipos";

const painel = {
  corte: "2026-11-06",
  filiais: ["Norte", "Sul"],
  canais: ["Atacado", "Varejo"],
  meses: ["2026-10", "2026-11"],
  produtos: { P1: ["Café 1 kg", "Café"], P2: ["Chá", "Chás"], P3: ["Copo", "Descartáveis"], P4: ["Filtro", "Acessórios"] },
  mensal: {
    "Todas|Todos": [[1000, 50, 10, 5], [500, 10, 5, 3]],
    "Norte|Todos": [[600, 30, 6, 3], [300, 0, 3, 2]],
    "Sul|Todos": [[400, 20, 4, 2], [200, 10, 2, 1]],
    "Todas|Atacado": [[800, 40, 8, 4], [400, 10, 4, 2]],
    "Todas|Varejo": [[200, 10, 2, 1], [100, 0, 1, 1]],
  },
  metas: { Todas: [1000, 1200], Norte: [600, 700], Sul: [400, 500] },
} as unknown as Painel;

const filtros = { mes: "2026-10", filial: "Todas", canal: "Todos" };

describe("curva ABC", () => {
  // 700 + 200 + 70 + 30 = 1000 -> acumulado 70%, 90%, 97%, 100%
  const dados: DadosProdutos = {
    porProduto: { "Todas|Todos": { "2026-10": [["P3", 70, 7, 0], ["P1", 700, 10, 7], ["P4", 30, 3, 6], ["P2", 200, 20, 0]] } },
  };
  const { itens, classes } = curvaAbc(painel, dados, filtros);

  it("ordena e acumula a participação", () => {
    expect(itens.map((i) => i.codigo)).toEqual(["P1", "P2", "P3", "P4"]);
    expect(itens.map((i) => Math.round(i.acumulado))).toEqual([70, 90, 97, 100]);
  });

  it("o item que cruza o limite fica na classe de cima", () => {
    // P2 começa em 70% (< 80) -> A; P3 começa em 90% (< 95) -> B; P4 começa em 97% -> C
    expect(itens.map((i) => i.classe)).toEqual(["A", "A", "B", "C"]);
    expect(classes.map((c) => [c.classe, c.itens, Math.round(c.participacao)])).toEqual([["A", 2, 90], ["B", 1, 7], ["C", 1, 3]]);
  });

  it("índice de devolução ignora vendas irrelevantes", () => {
    expect(produtosMaisDevolvidos(itens, 10, 0.05).map((i) => i.codigo)).toEqual(["P1"]); // P4 vende só 3%
    expect(produtosMaisDevolvidos(itens, 10, 0).map((i) => i.codigo)).toEqual(["P4", "P1"]); // 20% vs 1%
  });
});

describe("lead time", () => {
  it("média em dias úteis e % até D+1", () => {
    const r = resumoLeadTime([10, 20, 10, 0, 0, 10]);
    expect(r.notas).toBe(50);
    expect(r.media).toBeCloseTo((20 + 20 + 50) / 50);
    expect(r.ateD1).toBeCloseTo(60);
  });

  it("sem dados não quebra", () => {
    expect(resumoLeadTime(undefined)).toMatchObject({ notas: 0, media: 0, ateD1: 0 });
  });
});

describe("operação", () => {
  const dados = {
    leadTime: {},
    notasDia: { "Todas|Todos": { "2026-10": [[1, 2], [3, 1], [31, 4]], "2026-11": [[2, 3], [5, 1]] } },
    carteira: {
      situacoes: ["Liberado"],
      resumo: { "Norte|Todos": { valor: 250, pedidos: 2, porSituacao: [250] }, "Sul|Todos": { valor: 100, pedidos: 1, porSituacao: [100] } },
      pedidos: [],
    },
  } as unknown as DadosOperacao;

  it("notas acumuladas param no corte e comparam com o mês anterior inteiro", () => {
    const r = notasAcumuladas(painel, dados, { ...filtros, mes: "2026-11" }, 6);
    expect(r.atual.slice(0, 7)).toEqual([0, 3, 3, 3, 4, 4, null]);
    expect(r.anterior?.[30]).toBe(7);
    expect(r.mesAnterior).toBe("2026-10");
  });

  it("potencial = líquido faturado + carteira, contra a meta", () => {
    const [norte] = potencialPorFilial(painel, dados, { ...filtros, mes: "2026-11" });
    expect(norte).toMatchObject({ nome: "Norte", faturado: 300, carteira: 250, potencial: 550, meta: 700 });
    expect(norte.cobertura).toBeCloseTo((550 / 700) * 100);
  });
});

describe("devoluções", () => {
  it("taxa por filial ordenada da maior para a menor", () => {
    const filiais = taxaDevolucaoPor(painel, filtros, "filial");
    expect(filiais.map((f) => [f.nome, f.valor])).toEqual([["Norte", 5], ["Sul", 5]]);
    const canais = taxaDevolucaoPor(painel, { ...filtros, mes: "2026-11" }, "canal");
    expect(canais.map((c) => c.nome)).toEqual(["Atacado", "Varejo"]);
    expect(canais[0].valor).toBeCloseTo(2.5);
  });
});

describe("busca de notas", () => {
  const dados: DadosNotas = {
    colunas: [],
    linhas: [
      [100123, 5, 0, 0, "Café São José", "MG", 900, 3, 0],
      [100124, 2, 1, 1, "Padaria Aurora", "PR", 300, 2, 50],
      [100200, 9, 0, 1, "Empório Ipê", "MG", 1200, 4, 0],
    ],
  };

  it("filtra por filial, canal e termo sem diferenciar acentos", () => {
    expect(buscarNotas(painel, dados, filtros, "sao jose").map((l) => l[0])).toEqual([100123]);
    expect(buscarNotas(painel, dados, filtros, "1001").map((l) => l[0])).toEqual([100124, 100123]); // ordem por data
    expect(buscarNotas(painel, dados, { ...filtros, filial: "Norte" }, "").map((l) => l[0])).toEqual([100123, 100200]);
    expect(buscarNotas(painel, dados, filtros, "mg", "valor").map((l) => l[0])).toEqual([100200, 100123]);
  });

  it("gera CSV no padrão brasileiro", () => {
    const csv = notasParaCsv(painel, [dados.linhas[1]], "2026-10");
    expect(csv.split("\r\n")[1]).toBe('100124;02/10/2026;"Sul";"Varejo";"Padaria Aurora";PR;2;300,00;50,00');
  });
});
