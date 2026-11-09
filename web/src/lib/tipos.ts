/** Formato de public/data/painel.json (gerado por pipeline/transformar.py). */

/** [bruto, devoluções, notas emitidas, clientes ativos] */
export type LinhaMensal = [number, number, number, number];

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
