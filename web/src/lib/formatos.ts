const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** R$ 1.234.567,89 */
export const moedaCompleta = (v: number) => moeda.format(v);

/** R$ 3,7 mi · R$ 812 mil · R$ 1.268 (abaixo de 10 mil, valor inteiro) */
export function moedaCompacta(v: number): string {
  const abs = Math.abs(v);
  const sinal = v < 0 ? "−" : "";
  if (abs >= 1e6) return `${sinal}R$ ${decimal1.format(abs / 1e6)} mi`;
  if (abs >= 1e4) return `${sinal}R$ ${inteiro.format(abs / 1e3)} mil`;
  return `${sinal}R$ ${inteiro.format(abs)}`;
}

/** Eixo: 0 · 1 mi · 2,5 mi · 800 mil */
export function eixoMoeda(v: number): string {
  if (v === 0) return "0";
  if (Math.abs(v) >= 1e6) return `${decimal1.format(v / 1e6).replace(",0", "")} mi`;
  return `${inteiro.format(v / 1e3)} mil`;
}

export const numero = (v: number) => inteiro.format(v);
export const percentual = (v: number, casas = 1) =>
  `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v)}%`;

/** +4,2% / −1,3% */
export const variacaoTexto = (v: number) => `${v >= 0 ? "+" : "−"}${decimal1.format(Math.abs(v))}%`;

/** "2026-10" -> "out/26" */
export function mesCurto(mes: string): string {
  const [ano, num] = mes.split("-");
  return `${MESES[Number(num) - 1]}/${ano.slice(2)}`;
}

/** "2026-10" -> "Outubro de 2026" */
export function mesLongo(mes: string): string {
  const [ano, num] = mes.split("-");
  return `${MESES_LONGOS[Number(num) - 1]} de ${ano}`;
}

/**
 * Escala "bonita" para eixos: entre 4 e 6 divisões de passo redondo
 * (1, 2, 2,5 ou 5 × 10^n), escolhendo a que desperdiça menos altura.
 */
export function escala(maximo: number): { max: number; ticks: number[] } {
  if (maximo <= 0) return { max: 1, ticks: [0, 1] };
  let melhor = { max: Infinity, passo: 1 };
  for (const divisoes of [4, 5, 6]) {
    const bruto = maximo / divisoes;
    const potencia = 10 ** Math.floor(Math.log10(bruto));
    const passo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? bruto;
    const max = Math.ceil(maximo / passo - 1e-9) * passo;
    if (max < melhor.max) melhor = { max, passo };
  }
  const n = Math.round(melhor.max / melhor.passo);
  return { max: melhor.max, ticks: Array.from({ length: n + 1 }, (_, i) => i * melhor.passo) };
}
