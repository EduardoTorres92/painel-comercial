import type { LinhaTop } from "../lib/calculos";
import { moedaCompacta, moedaCompleta, numero } from "../lib/formatos";
import { Cartao } from "./base";

interface Props {
  titulo: string;
  subtitulo: string;
  linhas: LinhaTop[];
  rotuloExtra: string;
  className?: string;
}

/** Ranking em tabela, com uma barra fina proporcional ao primeiro colocado. */
export function TabelaTop({ titulo, subtitulo, linhas, rotuloExtra, className }: Props) {
  const maior = Math.max(...linhas.map((l) => l.valor), 1);
  return (
    <Cartao className={className} titulo={titulo} subtitulo={subtitulo}>
      {linhas.length === 0 ? (
        <p className="estado">Sem vendas no período.</p>
      ) : (
        <table className="tabela">
          <thead>
            <tr>
              <th className="pos">#</th>
              <th>Nome</th>
              <th className="direita">{rotuloExtra}</th>
              <th className="direita">Faturado</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={l.nome}>
                <td className="pos num">{i + 1}</td>
                <td>
                  <span className="nome">{l.nome}</span>
                  {l.detalhe && <span className="detalhe">{l.detalhe}</span>}
                  <span className="barra-inline" style={{ width: `${(l.valor / maior) * 100}%` }} aria-hidden="true" />
                </td>
                <td className="direita num">{numero(l.extra)}</td>
                <td className="direita num" title={moedaCompleta(l.valor)}>{moedaCompacta(l.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Cartao>
  );
}
