import { resumir } from "../lib/calculos";
import { moedaCompacta, moedaCompleta, percentual } from "../lib/formatos";
import { TODAS, TODOS, type Filtros, type Painel } from "../lib/tipos";
import { Delta } from "./Indicadores";

interface Props {
  painel: Painel;
  filtros: Filtros;
  onSelecionar: (filial: string) => void;
}

/**
 * Um card por filial com a composição do faturamento líquido:
 * bruto + cut-off inicial − cut-off − devoluções. Respeita o filtro de canal;
 * clicar num card filtra a filial (e clicar de novo remove o filtro).
 */
export function CardsFiliais({ painel, filtros, onSelecionar }: Props) {
  const resumos = painel.filiais.map((filial) => ({ filial, r: resumir(painel, { ...filtros, filial }) }));
  const totalBruto = resumos.reduce((s, { r }) => s + r.bruto, 0);
  const parcial = resumos[0]?.r.parcial ?? false;

  return (
    <section className="secao-filiais" aria-labelledby="titulo-filiais">
      <div className="secao-cabecalho">
        <h2 id="titulo-filiais">Faturamento líquido por filial</h2>
        <p>
          Líquido = bruto + cut-off inicial − cut-off − devoluções
          {filtros.canal !== TODOS ? ` · ${filtros.canal}` : ""} · clique para filtrar
        </p>
      </div>
      <ul className="cards-filiais">
        {resumos.map(({ filial, r }) => {
          const ativo = filtros.filial === filial;
          const apagado = filtros.filial !== TODAS && !ativo;
          const linhas: [string, string, string?][] = [
            ["Bruto", moedaCompacta(r.bruto), moedaCompleta(r.bruto)],
            ["Participação no bruto", percentual(totalBruto > 0 ? (r.bruto / totalBruto) * 100 : 0)],
            ["Cut-off inicial", `+ ${moedaCompacta(r.cutoffInicial)}`, moedaCompleta(r.cutoffInicial)],
            ["Cut-off", parcial ? "no fechamento" : `− ${moedaCompacta(r.cutoff)}`, parcial ? undefined : moedaCompleta(r.cutoff)],
            ["Devoluções", `− ${moedaCompacta(r.devolucoes)}`, moedaCompleta(r.devolucoes)],
          ];
          return (
            <li key={filial}>
              <button
                type="button"
                className={`card-filial${ativo ? " ativo" : ""}${apagado ? " apagado" : ""}`}
                aria-pressed={ativo}
                onClick={() => onSelecionar(filial)}
              >
                <span className="card-filial-nome">{filial}</span>
                <span className="card-filial-valor" title={moedaCompleta(r.liquido)}>{moedaCompacta(r.liquido)}</span>
                <span className="card-filial-delta">
                  <Delta valor={r.vsMesAnterior} rotulo={parcial ? "vs mesmos dias" : "vs mês anterior"} />
                </span>
                {r.meta !== null && (
                  <span className="card-filial-meta">
                    {percentual(((parcial ? r.projecao ?? 0 : r.liquido) / r.meta) * 100, 0)}{" "}
                    {parcial ? "da meta na projeção" : "da meta"}
                  </span>
                )}
                <dl>
                  {linhas.map(([rotulo, valor, titulo]) => (
                    <div key={rotulo}>
                      <dt>{rotulo}</dt>
                      <dd title={titulo}>{valor}</dd>
                    </div>
                  ))}
                </dl>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
