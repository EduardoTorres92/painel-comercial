/**
 * Cálculos das abas de análise (produtos, clientes, operação, devoluções e
 * notas). Funções puras sobre os JSONs gerados pelo pipeline, testadas em
 * tests/analises.test.ts.
 */
import { chave, chaveDe, diasNoMes, mesAnterior } from "./calculos";
import type {
  DadosClientes,
  DadosDevolucoes,
  DadosNotas,
  DadosOperacao,
  DadosProdutos,
  Filtros,
  LinhaNota,
  LinhaPedido,
  Painel,
} from "./tipos";
import { TODAS, TODOS } from "./tipos";

/* ---------------------------------------------------------------------------
 * Curva ABC
 * ------------------------------------------------------------------------- */

export type ClasseAbc = "A" | "B" | "C";

/** Limites de participação acumulada no faturamento: A até 80%, B até 95%. */
export const LIMITES_ABC = { A: 80, B: 95 } as const;

export interface ItemAbc {
  codigo: string;
  nome: string;
  categoria: string;
  valor: number;
  quantidade: number;
  devolvido: number;
  /** % do faturamento total */
  participacao: number;
  /** % acumulado até este item, inclusive */
  acumulado: number;
  classe: ClasseAbc;
}

export interface ResumoClasse {
  classe: ClasseAbc;
  itens: number;
  valor: number;
  participacao: number;
}

/**
 * Classifica os produtos pela participação acumulada. Um item é da classe A
 * se, antes dele, o acumulado ainda não chegou a 80% (assim o item que cruza
 * o limite fica na classe de cima); B até 95%; o resto é C.
 */
export function curvaAbc(painel: Painel, dados: DadosProdutos, filtros: Filtros): { itens: ItemAbc[]; classes: ResumoClasse[] } {
  const linhas = (dados.porProduto[chaveDe(filtros)]?.[filtros.mes] ?? []).filter(([, valor]) => valor > 0);
  const ordenadas = [...linhas].sort((a, b) => b[1] - a[1]);
  const total = ordenadas.reduce((s, [, v]) => s + v, 0);
  let acumulado = 0;
  const itens = ordenadas.map(([codigo, valor, quantidade, devolvido]) => {
    const antes = acumulado;
    const participacao = total > 0 ? (valor / total) * 100 : 0;
    acumulado += participacao;
    const classe: ClasseAbc = antes < LIMITES_ABC.A ? "A" : antes < LIMITES_ABC.B ? "B" : "C";
    return {
      codigo,
      nome: painel.produtos[codigo]?.[0] ?? codigo,
      categoria: painel.produtos[codigo]?.[1] ?? "",
      valor,
      quantidade,
      devolvido,
      participacao,
      acumulado,
      classe,
    };
  });
  const classes = (["A", "B", "C"] as const).map((classe) => {
    const doGrupo = itens.filter((i) => i.classe === classe);
    const valor = doGrupo.reduce((s, i) => s + i.valor, 0);
    return { classe, itens: doGrupo.length, valor, participacao: total > 0 ? (valor / total) * 100 : 0 };
  });
  return { itens, classes };
}

/** Produtos com maior índice de devolução (devolvido ÷ vendido), ignorando os de venda irrelevante. */
export function produtosMaisDevolvidos(itens: ItemAbc[], limite = 10, vendaMinima = 0.005): ItemAbc[] {
  const total = itens.reduce((s, i) => s + i.valor, 0);
  return itens
    .filter((i) => i.devolvido > 0 && i.valor >= total * vendaMinima)
    .sort((a, b) => b.devolvido / b.valor - a.devolvido / a.valor)
    .slice(0, limite);
}

/* ---------------------------------------------------------------------------
 * Clientes e regiões
 * ------------------------------------------------------------------------- */

export interface ItemUf {
  uf: string;
  valor: number;
  notas: number;
  clientes: number;
  participacao: number;
}

export function porEstado(dados: DadosClientes, filtros: Filtros): ItemUf[] {
  const ufs = dados.porUf[chaveDe(filtros)]?.[filtros.mes] ?? {};
  const total = Object.values(ufs).reduce((s, [v]) => s + v, 0);
  return Object.entries(ufs)
    .map(([uf, [valor, notas, clientes]]) => ({ uf, valor, notas, clientes, participacao: total > 0 ? (valor / total) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

/** Clientes ativos nos últimos `n` meses até o selecionado (da série mensal do painel). */
export function clientesPorMes(painel: Painel, filtros: Filtros, n = 12) {
  const fim = painel.meses.indexOf(filtros.mes);
  const inicio = Math.max(0, fim - n + 1);
  return painel.meses.slice(inicio, fim + 1).map((mes, j) => ({ mes, valor: painel.mensal[chaveDe(filtros)][inicio + j][3] }));
}

/* ---------------------------------------------------------------------------
 * Operação
 * ------------------------------------------------------------------------- */

export interface ResumoLeadTime {
  /** notas por D+0..D+5 */
  distribuicao: number[];
  notas: number;
  /** média em dias úteis (D+5 conta como 5) */
  media: number;
  /** % das notas emitidas em até 1 dia útil */
  ateD1: number;
}

export function resumoLeadTime(contagens: number[] | undefined): ResumoLeadTime {
  const distribuicao = contagens ?? [0, 0, 0, 0, 0, 0];
  const notas = distribuicao.reduce((s, q) => s + q, 0);
  const soma = distribuicao.reduce((s, q, d) => s + q * d, 0);
  return {
    distribuicao,
    notas,
    media: notas > 0 ? soma / notas : 0,
    ateD1: notas > 0 ? ((distribuicao[0] + distribuicao[1]) / notas) * 100 : 0,
  };
}

export function leadTime(dados: DadosOperacao, filtros: Filtros): ResumoLeadTime {
  return resumoLeadTime(dados.leadTime[chaveDe(filtros)]?.[filtros.mes]);
}

/** Lead time médio por filial, respeitando o filtro de canal. */
export function leadTimePorFilial(painel: Painel, dados: DadosOperacao, filtros: Filtros) {
  return painel.filiais
    .map((filial) => ({ nome: filial, ...resumoLeadTime(dados.leadTime[chave(filial, filtros.canal)]?.[filtros.mes]) }))
    .sort((a, b) => b.media - a.media);
}

/** Notas acumuladas dia a dia no mês e no mês anterior (mesmo dia do mês). */
export function notasAcumuladas(painel: Painel, dados: DadosOperacao, filtros: Filtros, diaCorte: number | null) {
  const k = chaveDe(filtros);
  const acumular = (mes: string, ate: number) => {
    const porDia = new Map(dados.notasDia[k]?.[mes] ?? []);
    let total = 0;
    return Array.from({ length: diasNoMes(mes) }, (_, i) => {
      total += porDia.get(i + 1) ?? 0;
      return i + 1 <= ate ? total : null;
    });
  };
  const anterior = mesAnterior(filtros.mes);
  const temAnterior = painel.meses.includes(anterior);
  return {
    atual: acumular(filtros.mes, diaCorte ?? diasNoMes(filtros.mes)),
    anterior: temAnterior ? acumular(anterior, diasNoMes(anterior)) : null,
    mesAnterior: temAnterior ? anterior : null,
  };
}

export interface PotencialFilial {
  nome: string;
  faturado: number;
  carteira: number;
  potencial: number;
  meta: number | null;
  /** % da meta coberto pelo potencial */
  cobertura: number | null;
}

/**
 * Potencial do mês por filial = líquido já faturado + carteira em aberto.
 * A carteira é uma foto do dia do corte, então só vale para o mês corrente.
 */
export function potencialPorFilial(painel: Painel, dados: DadosOperacao, filtros: Filtros): PotencialFilial[] {
  const i = painel.meses.indexOf(filtros.mes);
  return painel.filiais.map((filial) => {
    const [bruto, devolvido] = painel.mensal[chave(filial, filtros.canal)][i];
    const faturado = bruto - devolvido;
    const carteira = dados.carteira.resumo[chave(filial, filtros.canal)]?.valor ?? 0;
    const meta = filtros.canal === TODOS ? painel.metas[filial][i] : null;
    const potencial = faturado + carteira;
    return { nome: filial, faturado, carteira, potencial, meta, cobertura: meta ? (potencial / meta) * 100 : null };
  });
}

export function pedidosFiltrados(painel: Painel, dados: DadosOperacao, filtros: Filtros): LinhaPedido[] {
  const f = filtros.filial === TODAS ? -1 : painel.filiais.indexOf(filtros.filial);
  const c = filtros.canal === TODOS ? -1 : painel.canais.indexOf(filtros.canal);
  return dados.carteira.pedidos.filter((p) => (f < 0 || p[1] === f) && (c < 0 || p[2] === c));
}

/* ---------------------------------------------------------------------------
 * Devoluções
 * ------------------------------------------------------------------------- */

export function porMotivo(dados: DadosDevolucoes, filtros: Filtros) {
  const registro = dados.porMotivo[chaveDe(filtros)]?.[filtros.mes];
  const valores = registro?.valores ?? dados.motivos.map(() => 0);
  const total = valores.reduce((s, v) => s + v, 0);
  return {
    notas: registro?.notas ?? 0,
    itens: dados.motivos
      .map((nome, j) => ({ nome, valor: valores[j], participacao: total > 0 ? (valores[j] / total) * 100 : 0 }))
      .sort((a, b) => b.valor - a.valor),
  };
}

/** Taxa de devolução (% do bruto) nos últimos `n` meses. */
export function taxaDevolucaoMensal(painel: Painel, filtros: Filtros, n = 12) {
  const fim = painel.meses.indexOf(filtros.mes);
  const inicio = Math.max(0, fim - n + 1);
  return painel.meses.slice(inicio, fim + 1).map((mes, j) => {
    const [bruto, devolvido] = painel.mensal[chaveDe(filtros)][inicio + j];
    return { mes, valor: bruto > 0 ? (devolvido / bruto) * 100 : 0, devolvido };
  });
}

/** Taxa de devolução por filial (respeitando o canal) ou por canal (respeitando a filial). */
export function taxaDevolucaoPor(painel: Painel, filtros: Filtros, dimensao: "filial" | "canal") {
  const i = painel.meses.indexOf(filtros.mes);
  const nomes = dimensao === "filial" ? painel.filiais : painel.canais;
  return nomes
    .map((nome) => {
      const k = dimensao === "filial" ? chave(nome, filtros.canal) : chave(filtros.filial, nome);
      const [bruto, devolvido] = painel.mensal[k][i];
      return { nome, valor: bruto > 0 ? (devolvido / bruto) * 100 : 0, devolvido, participacao: 0 };
    })
    .sort((a, b) => b.valor - a.valor);
}

/* ---------------------------------------------------------------------------
 * Notas fiscais (busca)
 * ------------------------------------------------------------------------- */

export type OrdemNotas = "data" | "valor" | "devolvido";

const normalizar = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Filtra as notas do mês pelos filtros globais e por um termo livre (número
 * da nota, cliente ou UF), sem diferenciar acentos e maiúsculas.
 */
export function buscarNotas(painel: Painel, dados: DadosNotas, filtros: Filtros, termo: string, ordem: OrdemNotas = "data"): LinhaNota[] {
  const f = filtros.filial === TODAS ? -1 : painel.filiais.indexOf(filtros.filial);
  const c = filtros.canal === TODOS ? -1 : painel.canais.indexOf(filtros.canal);
  const busca = normalizar(termo.trim());
  const resultado = dados.linhas.filter((l) => {
    if (f >= 0 && l[2] !== f) return false;
    if (c >= 0 && l[3] !== c) return false;
    if (!busca) return true;
    return String(l[0]).includes(busca) || normalizar(l[4]).includes(busca) || normalizar(l[5]) === busca;
  });
  const chaveOrdem = { data: (l: LinhaNota) => l[1] * 1e7 + l[0], valor: (l: LinhaNota) => -l[6], devolvido: (l: LinhaNota) => -l[8] }[ordem];
  return resultado.sort((a, b) => chaveOrdem(a) - chaveOrdem(b));
}

/** CSV (separado por ";", decimal com vírgula) das notas, para abrir no Excel. */
export function notasParaCsv(painel: Painel, linhas: LinhaNota[], mes: string): string {
  const numero = (v: number) => v.toFixed(2).replace(".", ",");
  const aspas = (t: string) => `"${t.replace(/"/g, '""')}"`;
  const cabecalho = ["Nota fiscal", "Data", "Filial", "Canal", "Cliente", "UF", "Itens", "Valor", "Devolvido"];
  const corpo = linhas.map((l) =>
    [
      l[0],
      `${String(l[1]).padStart(2, "0")}/${mes.slice(5, 7)}/${mes.slice(0, 4)}`,
      aspas(painel.filiais[l[2]]),
      aspas(painel.canais[l[3]]),
      aspas(l[4]),
      l[5],
      l[7],
      numero(l[6]),
      numero(l[8]),
    ].join(";"),
  );
  return [cabecalho.join(";"), ...corpo].join("\r\n");
}
