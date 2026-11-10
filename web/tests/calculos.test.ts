import { describe, expect, it } from "vitest";
import {
  composicao,
  diasUteis,
  mesAnterior,
  porCanal,
  porFilial,
  resumir,
  ritmoDoMes,
  serieMensal,
  variacao,
} from "../src/lib/calculos";
import { escala, moedaCompacta, variacaoTexto } from "../src/lib/formatos";
import type { Painel } from "../src/lib/tipos";

/**
 * Painel mínimo, com números redondos para conferir as contas à mão.
 * Mês corrente (2026-11) está parcial: corte no dia 6 (sexta-feira).
 */
function painelDeTeste(): Painel {
  const meses = ["2025-10", "2026-10", "2026-11"];
  const linhas = {
    // [bruto, devoluções, notas, clientes]
    "Todas|Todos": [[1000, 100, 10, 5], [2000, 200, 20, 8], [600, 0, 6, 4]],
    "Norte|Todos": [[600, 60, 6, 3], [1200, 100, 12, 5], [400, 0, 4, 3]],
    "Sul|Todos": [[400, 40, 4, 2], [800, 100, 8, 3], [200, 0, 2, 1]],
    "Todas|Atacado": [[700, 70, 7, 3], [1500, 150, 15, 5], [500, 0, 5, 3]],
    "Todas|Varejo": [[300, 30, 3, 2], [500, 50, 5, 3], [100, 0, 1, 1]],
    "Norte|Atacado": [[400, 40, 4, 2], [900, 80, 9, 3], [350, 0, 3, 2]],
    "Norte|Varejo": [[200, 20, 2, 1], [300, 20, 3, 2], [50, 0, 1, 1]],
    "Sul|Atacado": [[300, 30, 3, 1], [600, 70, 6, 2], [150, 0, 2, 1]],
    "Sul|Varejo": [[100, 10, 1, 1], [200, 30, 2, 1], [50, 0, 0, 0]],
  } as Record<string, [number, number, number, number][]>;

  return {
    versao: 1,
    empresa: "Teste",
    aviso: "",
    geradoEm: "2026-11-07T00:00:00+00:00",
    corte: "2026-11-06",
    filiais: ["Norte", "Sul"],
    canais: ["Atacado", "Varejo"],
    meses,
    categorias: [],
    produtos: {},
    mensal: linhas,
    metas: { Todas: [900, 2000, 4000], Norte: [500, 1200, 2500], Sul: [400, 800, 1500] },
    diario: {
      "Todas|Todos": {
        // outubro: 100/dia nos 6 primeiros dias, o resto no dia 31
        "2026-10": [[1, 100], [2, 100], [3, 100], [6, 100], [31, 1400]],
        "2026-11": [[3, 200], [4, 200], [6, 200]],
      },
    },
    topProdutos: {},
    topClientes: {},
    mixCategorias: {},
  };
}

describe("datas", () => {
  it("volta meses atravessando o ano", () => {
    expect(mesAnterior("2026-01")).toBe("2025-12");
    expect(mesAnterior("2026-11", 12)).toBe("2025-11");
  });

  it("conta dias úteis (segunda a sexta)", () => {
    expect(diasUteis("2026-11")).toBe(21); // novembro/2026: 30 dias, 9 de fim de semana
    expect(diasUteis("2026-11", 6)).toBe(5); // 2 a 6 de novembro
  });
});

describe("resumo do mês fechado", () => {
  const painel = painelDeTeste();
  const r = resumir(painel, { mes: "2026-10", filial: "Todas", canal: "Todos" });

  it("calcula líquido, ticket e taxa de devolução", () => {
    expect(r.liquido).toBe(1800);
    expect(r.ticketMedio).toBe(100);
    expect(r.taxaDevolucao).toBe(10);
    expect(r.parcial).toBe(false);
    expect(r.projecao).toBeNull();
  });

  it("compara com a meta e com o ano anterior", () => {
    expect(r.atingimento).toBe(90);
    expect(r.vsAnoAnterior).toBe(100); // 1800 vs 900
  });

  it("sem meta quando há filtro de canal", () => {
    const comCanal = resumir(painel, { mes: "2026-10", filial: "Todas", canal: "Atacado" });
    expect(comCanal.meta).toBeNull();
    expect(comCanal.atingimento).toBeNull();
  });
});

describe("resumo do mês em andamento", () => {
  const painel = painelDeTeste();
  const r = resumir(painel, { mes: "2026-11", filial: "Todas", canal: "Todos" });

  it("detecta o mês parcial", () => {
    expect(r.parcial).toBe(true);
    expect(r.diaCorte).toBe(6);
  });

  it("projeta o fim do mês pelos dias úteis", () => {
    // 600 em 5 dias úteis -> 120/dia × 21 dias úteis
    expect(r.projecao).toBeCloseTo(2520);
    expect(r.atingimentoProjetado).toBeCloseTo(63);
  });

  it("compara os mesmos dias do mês anterior", () => {
    // outubro até o dia 6: 400 -> 600 é +50%
    expect(r.vsMesAnterior).toBeCloseTo(50);
  });

  it("não compara ticket e clientes com mês completo", () => {
    expect(r.ticketVsMesAnterior).toBeNull();
    expect(r.clientesVsMesAnterior).toBeNull();
  });
});

describe("séries e rankings", () => {
  const painel = painelDeTeste();
  const filtros = { mes: "2026-10", filial: "Todas", canal: "Todos" };

  it("série mensal termina no mês selecionado", () => {
    const serie = serieMensal(painel, filtros, 2);
    expect(serie.map((p) => p.mes)).toEqual(["2025-10", "2026-10"]);
    expect(serie[1]).toEqual({ mes: "2026-10", liquido: 1800, meta: 2000 });
  });

  it("ritmo acumula o líquido e distribui a meta pelos dias úteis", () => {
    const novembro = { ...filtros, mes: "2026-11" };
    const pontos = ritmoDoMes(painel, novembro, resumir(painel, novembro));
    expect(pontos).toHaveLength(30);
    expect(pontos[5]).toMatchObject({ dia: 6, realizado: 600 });
    expect(pontos[6].realizado).toBeNull(); // depois do corte
    expect(pontos[29].meta).toBeCloseTo(4000);
  });

  it("ranking por canal respeita o filtro de filial", () => {
    const canais = porCanal(painel, { ...filtros, filial: "Norte" });
    expect(canais.map((c) => [c.nome, c.valor])).toEqual([["Atacado", 820], ["Varejo", 280]]);
    expect(canais[0].participacao).toBeCloseTo((820 / 1100) * 100);
  });

  it("ranking por filial traz a meta", () => {
    const filiais = porFilial(painel, filtros);
    expect(filiais[0]).toMatchObject({ nome: "Norte", valor: 1100, meta: 1200 });
  });

  it("no mês em andamento, a meta da filial é proporcional aos dias úteis", () => {
    const norte = porFilial(painel, { ...filtros, mes: "2026-11" }).find((f) => f.nome === "Norte")!;
    expect(norte.meta).toBeCloseTo((2500 * 5) / 21); // 5 de 21 dias úteis
  });
});

describe("cut-off", () => {
  // Outubro fecha com 150 de cut-off (notas entregues em novembro)
  const painel = painelDeTeste();
  painel.mensal["Todas|Todos"][1] = [2000, 200, 20, 8, 150];
  const outubro = { mes: "2026-10", filial: "Todas", canal: "Todos" };
  const novembro = { ...outubro, mes: "2026-11" };

  it("líquido = bruto + cut-off inicial − cut-off − devoluções", () => {
    expect(composicao(painel, "Todas|Todos", "2026-10")).toEqual({
      bruto: 2000, devolucoes: 200, cutoffInicial: 0, cutoff: 150, liquido: 1650,
    });
    // o cut-off de outubro entra em novembro como cut-off inicial
    expect(composicao(painel, "Todas|Todos", "2026-11")).toMatchObject({ cutoffInicial: 150, cutoff: 0, liquido: 750 });
  });

  it("projeção soma o cut-off inicial e desconta o cut-off esperado", () => {
    // 150 + 600/5×21 − 7,5% (taxa de outubro) × 600/5×21
    expect(resumir(painel, novembro).projecao).toBeCloseTo(150 + 2520 - 189);
  });

  it("comparação dos mesmos dias usa o cut-off inicial dos dois meses", () => {
    // novembro até o dia 6: 150 + 600 = 750; outubro até o dia 6: 0 + 400
    expect(resumir(painel, novembro).vsMesAnterior).toBeCloseTo(87.5);
  });

  it("ritmo começa no cut-off inicial e, no mês fechado, termina no líquido", () => {
    expect(ritmoDoMes(painel, novembro, resumir(painel, novembro))[5].realizado).toBe(750);
    const pontos = ritmoDoMes(painel, outubro, resumir(painel, outubro));
    expect(pontos[30].realizado).toBe(1650);
  });
});

describe("formatos", () => {
  it("variação com sinal e base zero", () => {
    expect(variacao(110, 100)).toBeCloseTo(10);
    expect(variacao(10, 0)).toBeNull();
    expect(variacaoTexto(-1.25)).toBe("−1,3%");
  });

  it("moeda compacta", () => {
    expect(moedaCompacta(3_720_000)).toBe("R$ 3,7 mi");
    expect(moedaCompacta(812_400)).toBe("R$ 812 mil");
    expect(moedaCompacta(1_268.4)).toBe("R$ 1.268");
  });

  it("escala de eixo arredondada", () => {
    expect(escala(4_780_000)).toEqual({ max: 5_000_000, ticks: [0, 1e6, 2e6, 3e6, 4e6, 5e6] });
    expect(escala(812_000).max).toBe(1_000_000);
  });
});
