/** Formato de public/data/painel.json (gerado por pipeline/transformar.py). */

/**
 * [bruto, devoluções, notas emitidas, clientes ativos, cut-off]
 * Cut-off: notas emitidas no mês e entregues no seguinte (0 no mês em andamento).
 */
export type LinhaMensal = [number, number, number, number, number?];

/** Chave de combinação de filtro: "<filial>|<canal>", com "Todas"/"Todos". */
export type ChaveFiltro = string;

export interface Painel {
  versao: number;
  empresa: string;
  aviso: string;
  geradoEm: string;
  /** Último dia com dados (AAAA-MM-DD); o mês dele pode estar incompleto. */
  corte: string;
  filiais: string[];
  canais: string[];
  /** "AAAA-MM", em ordem. */
  meses: string[];
  categorias: string[];
  /** código -> [descrição, categoria] */
  produtos: Record<string, [string, string]>;
  /** Uma linha por mês, na ordem de `meses`. */
  mensal: Record<ChaveFiltro, LinhaMensal[]>;
  /** Meta de faturamento líquido por filial ("Todas" = soma), na ordem de `meses`. */
  metas: Record<string, number[]>;
  /** Líquido por dia: mês -> [dia, valor][] */
  diario: Record<ChaveFiltro, Record<string, [number, number][]>>;
  /** mês -> [código, valor, quantidade][] */
  topProdutos: Record<ChaveFiltro, Record<string, [string, number, number][]>>;
  /** mês -> [cliente, valor, notas][] */
  topClientes: Record<ChaveFiltro, Record<string, [string, number, number][]>>;
  /** mês -> valor por categoria, na ordem de `categorias` */
  mixCategorias: Record<ChaveFiltro, Record<string, number[]>>;
}

export interface Filtros {
  mes: string;
  /** Nome da filial ou "Todas". */
  filial: string;
  /** Nome do canal ou "Todos". */
  canal: string;
}

export const TODAS = "Todas";
export const TODOS = "Todos";

/* ---------- Dados das abas (carregados sob demanda) ---------- */

/** [código, valor bruto, quantidade, valor devolvido] */
export type LinhaProduto = [string, number, number, number];

export interface DadosProdutos {
  porProduto: Record<ChaveFiltro, Record<string, LinhaProduto[]>>;
}

/** UF -> [valor bruto, notas, clientes] */
export interface DadosClientes {
  porUf: Record<ChaveFiltro, Record<string, Record<string, [number, number, number]>>>;
}

/** [pedido, filial (índice), canal (índice), cliente, UF, data do pedido, entrega prevista, situação (índice), valor] */
export type LinhaPedido = [string, number, number, string, string, string, string, number, number];

export interface DadosOperacao {
  /** mês -> notas por D+0..D+5 */
  leadTime: Record<ChaveFiltro, Record<string, number[]>>;
  /** mês -> [dia, notas emitidas][] */
  notasDia: Record<ChaveFiltro, Record<string, [number, number][]>>;
  carteira: {
    situacoes: string[];
    resumo: Record<ChaveFiltro, { valor: number; pedidos: number; porSituacao: number[] }>;
    pedidos: LinhaPedido[];
  };
}

export interface DadosDevolucoes {
  motivos: string[];
  porMotivo: Record<ChaveFiltro, Record<string, { valores: number[]; notas: number }>>;
}

/** [nota, dia, filial (índice), canal (índice), cliente, UF, valor, itens, devolvido] */
export type LinhaNota = [number, number, number, number, string, string, number, number, number];

export interface DadosNotas {
  colunas: string[];
  linhas: LinhaNota[];
}
