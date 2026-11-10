import type { CSSProperties } from "react";
import type { ItemUf } from "../lib/analises";
import { moedaCompacta, moedaCompleta, numero, percentual } from "../lib/formatos";
import { Cartao } from "./base";

/** Posição (coluna, linha) de cada UF numa grade 7 × 7 que lembra o mapa do Brasil. */
const GRADE: Record<string, [number, number]> = {
  RR: [2, 0], AP: [4, 0],
  AM: [1, 1], PA: [3, 1], MA: [4, 1], CE: [5, 1], RN: [6, 1],
  AC: [0, 2], RO: [1, 2], MT: [2, 2], TO: [3, 2], PI: [4, 2], PE: [5, 2], PB: [6, 2],
  MS: [2, 3], GO: [3, 3], DF: [4, 3], BA: [5, 3], AL: [6, 3],
  PR: [2, 4], SP: [3, 4], MG: [4, 4], ES: [5, 4], SE: [6, 4],
  SC: [2, 5], RJ: [4, 5],
  RS: [2, 6],
};

const NOMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
  MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins", EX: "Exterior",
};

const FAIXAS = 6;

/**
 * Mapa em grade: um quadrado por estado, na posição aproximada. A cor segue
 * uma escala sequencial de um só tom (mais escuro = mais faturamento), em 6
 * faixas de tamanho igual entre zero e o maior valor.
 */
export function MapaEstados({ itens, className }: { itens: ItemUf[]; className?: string }) {
  const porUf = new Map(itens.map((i) => [i.uf, i]));
  const maior = Math.max(...itens.filter((i) => i.uf !== "EX").map((i) => i.valor), 1);
  const faixa = (v: number) => Math.min(FAIXAS, Math.max(1, Math.ceil((v / maior) * FAIXAS)));
  const exterior = porUf.get("EX");

  const estilo = (v: number): CSSProperties => {
    const f = faixa(v);
    return { background: `var(--seq-${f})`, color: f <= 3 ? "var(--seq-texto-claro)" : "var(--seq-texto-escuro)" };
  };

  const tabela = (
    <table className="tabela">
      <thead>
        <tr>
          <th>Estado</th>
          <th className="direita">Faturamento</th>
          <th className="direita">%</th>
          <th className="direita">Notas</th>
          <th className="direita">Clientes</th>
        </tr>
      </thead>
      <tbody>
        {itens.map((i) => (
          <tr key={i.uf}>
            <td>{NOMES[i.uf] ?? i.uf}</td>
            <td className="direita num">{moedaCompleta(i.valor)}</td>
            <td className="direita num">{percentual(i.participacao)}</td>
            <td className="direita num">{numero(i.notas)}</td>
            <td className="direita num">{numero(i.clientes)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Cartao className={className} titulo="Faturamento por estado" subtitulo="Bruto por UF do cliente · passe o mouse para ver os valores" tabela={tabela}>
      <div className="mapa" role="list" aria-label="Faturamento por estado">
        {Object.entries(GRADE).map(([uf, [coluna, linha]]) => {
          const item = porUf.get(uf);
          const texto = item
            ? `${NOMES[uf]}: ${moedaCompleta(item.valor)} (${percentual(item.participacao)}), ${numero(item.notas)} notas`
            : `${NOMES[uf]}: sem vendas`;
          return (
            <div
              key={uf}
              role="listitem"
              tabIndex={0}
              className={`uf${item ? "" : " vazio"}`}
              style={{ gridColumn: coluna + 1, gridRow: linha + 1, ...(item ? estilo(item.valor) : {}) }}
              title={texto}
              aria-label={texto}
            >
              {uf}
              {item && item.participacao >= 3 && <small>{percentual(item.participacao, 0)}</small>}
            </div>
          );
        })}
      </div>
      <div className="mapa-rodape">
        <div className="escala" aria-hidden="true">
          <span>0</span>
          {Array.from({ length: FAIXAS }, (_, i) => (
            <span key={i} className="faixa" style={{ background: `var(--seq-${i + 1})` }} />
          ))}
          <span>{moedaCompacta(maior)}</span>
        </div>
        {exterior && (
          <span>
            Exterior (exportação): <b className="num">{moedaCompacta(exterior.valor)}</b> · {percentual(exterior.participacao)}
          </span>
        )}
      </div>
    </Cartao>
  );
}
