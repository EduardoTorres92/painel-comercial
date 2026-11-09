/**
 * Cálculos do painel a partir do JSON pré-agregado.
 *
 * As regras de negócio (o que é bruto, devolução, líquido, cliente ativo)
 * ficam no pipeline Python. Aqui só derivamos indicadores para exibição:
 * ticket médio, taxa de devolução, atingimento de meta, comparações e a
 * projeção do mês em andamento.
 */
import { TODAS, TODOS, type ChaveFiltro, type Filtros, type Painel } from "./tipos";

export const chave = (filial: string, canal: string): ChaveFiltro => `${filial}|${canal}`;

export const chaveDe = (f: Filtros): ChaveFiltro => chave(f.filial, f.canal);

export function mesAnterior(mes: string, passos = 1): string {
  const [ano, num] = mes.split("-").map(Number);
  const total = ano * 12 + (num - 1) - passos;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function diasNoMes(mes: string): number {
  const [ano, num] = mes.split("-").map(Number);
  return new Date(ano, num, 0).getDate();
}

/** Dias úteis (segunda a sexta) do mês, até o dia `ate` inclusive. */
export function diasUteis(mes: string, ate = diasNoMes(mes)): number {
  const [ano, num] = mes.split("-").map(Number);
  let total = 0;
  for (let dia = 1; dia <= ate; dia++) {
    const semana = new Date(ano, num - 1, dia).getDay();
    if (semana !== 0 && semana !== 6) total++;
  }
  return total;
}

/** Variação percentual; null quando não há base de comparação. */
export function variacao(atual: number, anterior: number | null | undefined): number | null {
  if (anterior === null || anterior === undefined || anterior <= 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

/**
 * Fração da meta do mês que vale até o corte: 1 para mês fechado; no mês em
 * andamento, dias úteis decorridos ÷ dias úteis do mês.
 */
export function fracaoMetaAteCorte(painel: Painel, mes: string): number {
  const dia = Number(painel.corte.slice(8, 10));
  if (painel.corte.slice(0, 7) !== mes || dia >= diasNoMes(mes)) return 1;
  return diasUteis(mes, dia) / diasUteis(mes);
}

export interface Resumo {
  mes: string;
  bruto: number;
  devolucoes: number;
  liquido: number;
  notas: number;
  clientes: number;
  ticketMedio: number;
  /** % do bruto */
  taxaDevolucao: number;
  /** null quando há filtro de canal (as metas são por filial) */
  meta: number | null;
  /** % da meta já realizada */
  atingimento: number | null;
  /** O mês ainda está em andamento (é o mês do corte e o corte não é o último dia). */
  parcial: boolean;
  /** Dia do corte, quando parcial. */
  diaCorte: number | null;
  /** Projeção do líquido no fim do mês (só no mês parcial). */
  projecao: number | null;
  atingimentoProjetado: number | null;
  /** Variação do líquido, comparando os mesmos dias quando o mês é parcial. */
  vsMesAnterior: number | null;
  vsAnoAnterior: number | null;
  /** Variações que só fazem sentido com o mês completo (null no mês parcial). */
  ticketVsMesAnterior: number | null;
  clientesVsMesAnterior: number | null;
  taxaDevolucaoAnterior: number | null;
}

function liquidoAteDia(painel: Painel, k: ChaveFiltro, mes: string, dia: number): number | null {
  const dias = painel.diario[k]?.[mes];
  if (!painel.meses.includes(mes)) return null;
  return (dias ?? []).filter(([d]) => d <= dia).reduce((s, [, v]) => s + v, 0);
}

function linha(painel: Painel, k: ChaveFiltro, mes: string) {
  const i = painel.meses.indexOf(mes);
  return i < 0 ? null : painel.mensal[k]?.[i] ?? null;
}

export function resumir(painel: Painel, filtros: Filtros): Resumo {
  const k = chaveDe(filtros);
  const { mes } = filtros;
  const [bruto, devolucoes, notas, clientes] = linha(painel, k, mes) ?? [0, 0, 0, 0];
  const liquido = bruto - devolucoes;

  const corte = painel.corte;
  const diaCorte = Number(corte.slice(8, 10));
  const parcial = corte.slice(0, 7) === mes && diaCorte < diasNoMes(mes);

  const i = painel.meses.indexOf(mes);
  const meta = filtros.canal === TODOS ? painel.metas[filtros.filial]?.[i] ?? null : null;

  let projecao: number | null = null;
  if (parcial) {
    const decorridos = diasUteis(mes, diaCorte);
    projecao = decorridos > 0 ? (liquido / decorridos) * diasUteis(mes) : null;
  }

  // Comparações do líquido: no mês parcial, mesmos dias corridos do mês de comparação
  const comparar = (outro: string) => {
    if (parcial) {
      const diaLimite = Math.min(diaCorte, diasNoMes(outro));
      return liquidoAteDia(painel, k, outro, diaLimite);
    }
    const l = linha(painel, k, outro);
    return l ? l[0] - l[1] : null;
  };

  const anterior = linha(painel, k, mesAnterior(mes));
  const ticketMedio = notas > 0 ? bruto / notas : 0;
  const ticketAnterior = anterior && anterior[2] > 0 ? anterior[0] / anterior[2] : null;

  return {
    mes,
    bruto,
    devolucoes,
    liquido,
    notas,
    clientes,
    ticketMedio,
    taxaDevolucao: bruto > 0 ? (devolucoes / bruto) * 100 : 0,
    meta,
    atingimento: meta ? (liquido / meta) * 100 : null,
    parcial,
    diaCorte: parcial ? diaCorte : null,
    projecao,
    atingimentoProjetado: meta && projecao !== null ? (projecao / meta) * 100 : null,
    vsMesAnterior: variacao(liquido, comparar(mesAnterior(mes))),
    vsAnoAnterior: variacao(liquido, comparar(mesAnterior(mes, 12))),
    ticketVsMesAnterior: parcial ? null : variacao(ticketMedio, ticketAnterior),
    clientesVsMesAnterior: parcial ? null : variacao(clientes, anterior?.[3]),
    taxaDevolucaoAnterior: anterior && anterior[0] > 0 ? (anterior[1] / anterior[0]) * 100 : null,
  };
}

export interface PontoMensal {
  mes: string;
  liquido: number;
  meta: number | null;
}

/** Últimos `n` meses até o mês selecionado. */
export function serieMensal(painel: Painel, filtros: Filtros, n = 12): PontoMensal[] {
  const fim = painel.meses.indexOf(filtros.mes);
  const inicio = Math.max(0, fim - n + 1);
  const k = chaveDe(filtros);
  return painel.meses.slice(inicio, fim + 1).map((mes, j) => {
    const [bruto, devol] = painel.mensal[k][inicio + j];
    const meta = filtros.canal === TODOS ? painel.metas[filtros.filial]?.[inicio + j] ?? null : null;
    return { mes, liquido: bruto - devol, meta };
  });
}

export interface PontoRitmo {
  dia: number;
  /** Líquido acumulado até o dia (null depois do corte). */
  realizado: number | null;
  /** Meta proporcional aos dias úteis decorridos. */
  meta: number | null;
}

/** Acumulado diário do mês vs. meta distribuída pelos dias úteis. */
export function ritmoDoMes(painel: Painel, filtros: Filtros, resumo: Resumo): PontoRitmo[] {
  const { mes } = filtros;
  const total = diasNoMes(mes);
  const uteis = diasUteis(mes);
  const porDia = new Map(painel.diario[chaveDe(filtros)]?.[mes] ?? []);
  const ultimo = resumo.parcial && resumo.diaCorte ? resumo.diaCorte : total;
  let acumulado = 0;
  const pontos: PontoRitmo[] = [];
  for (let dia = 1; dia <= total; dia++) {
    acumulado += porDia.get(dia) ?? 0;
    pontos.push({
      dia,
      realizado: dia <= ultimo ? acumulado : null,
      meta: resumo.meta !== null && uteis > 0 ? (resumo.meta * diasUteis(mes, dia)) / uteis : null,
    });
  }
  return pontos;
}

export interface ItemRanking {
  nome: string;
  valor: number;
  /** % do total do ranking */
  participacao: number;
  meta?: number | null;
}

function ranking(itens: { nome: string; valor: number; meta?: number | null }[]): ItemRanking[] {
  const total = itens.reduce((s, i) => s + Math.max(i.valor, 0), 0);
  return itens
    .map((i) => ({ ...i, participacao: total > 0 ? (i.valor / total) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

/** Líquido por canal, respeitando o filtro de filial. */
export function porCanal(painel: Painel, filtros: Filtros): ItemRanking[] {
  const i = painel.meses.indexOf(filtros.mes);
  return ranking(
    painel.canais.map((canal) => {
      const [b, d] = painel.mensal[chave(filtros.filial, canal)][i];
      return { nome: canal, valor: b - d };
    }),
  );
}

/**
 * Líquido e meta por filial, respeitando o filtro de canal. No mês em
 * andamento, a meta é a proporcional aos dias úteis até o corte.
 */
export function porFilial(painel: Painel, filtros: Filtros): ItemRanking[] {
  const i = painel.meses.indexOf(filtros.mes);
  const fracao = fracaoMetaAteCorte(painel, filtros.mes);
  return ranking(
    painel.filiais.map((filial) => {
      const [b, d] = painel.mensal[chave(filial, filtros.canal)][i];
      return { nome: filial, valor: b - d, meta: filtros.canal === TODOS ? painel.metas[filial][i] * fracao : null };
    }),
  );
}

/** Faturamento bruto por categoria de produto. */
export function porCategoria(painel: Painel, filtros: Filtros): ItemRanking[] {
  const valores = painel.mixCategorias[chaveDe(filtros)]?.[filtros.mes] ?? [];
  return ranking(painel.categorias.map((nome, j) => ({ nome, valor: valores[j] ?? 0 })));
}

export interface LinhaTop {
  nome: string;
  detalhe: string;
  valor: number;
  extra: number;
}

export function topProdutos(painel: Painel, filtros: Filtros): LinhaTop[] {
  return (painel.topProdutos[chaveDe(filtros)]?.[filtros.mes] ?? []).map(([codigo, valor, qtd]) => ({
    nome: painel.produtos[codigo]?.[0] ?? codigo,
    detalhe: `${codigo} · ${painel.produtos[codigo]?.[1] ?? ""}`,
    valor,
    extra: qtd,
  }));
}

export function topClientes(painel: Painel, filtros: Filtros): LinhaTop[] {
  return (painel.topClientes[chaveDe(filtros)]?.[filtros.mes] ?? []).map(([cliente, valor, notas]) => ({
    nome: cliente,
    detalhe: "",
    valor,
    extra: notas,
  }));
}

export const filtrosPadrao = (painel: Painel): Filtros => ({
  mes: painel.meses[painel.meses.length - 1],
  filial: TODAS,
  canal: TODOS,
});
