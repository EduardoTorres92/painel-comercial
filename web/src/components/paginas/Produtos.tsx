import { useMemo } from "react";
import { curvaAbc } from "../../lib/analises";
import { porCategoria } from "../../lib/calculos";
import { useJson } from "../../lib/dados";
import { moedaCompacta, moedaCompleta, numero, percentual } from "../../lib/formatos";
import type { DadosProdutos, Filtros, Painel } from "../../lib/tipos";
import { ComDados, Tiles } from "../Abas";
import { BarrasRanking } from "../BarrasRanking";
import { GraficoPareto } from "../GraficoPareto";
import { Cartao } from "../base";

export function AbaProdutos({ painel, filtros }: { painel: Painel; filtros: Filtros }) {
  const estado = useJson<DadosProdutos>("/data/produtos.json");
  return <ComDados estado={estado}>{(dados) => <Conteudo painel={painel} dados={dados} filtros={filtros} />}</ComDados>;
}

function Conteudo({ painel, dados, filtros }: { painel: Painel; dados: DadosProdutos; filtros: Filtros }) {
  const { itens, classes } = useMemo(() => curvaAbc(painel, dados, filtros), [painel, dados, filtros]);
  const categorias = useMemo(() => porCategoria(painel, filtros), [painel, filtros]);
  const total = itens.reduce((s, i) => s + i.valor, 0);
  const [a, b, c] = classes;

  if (itens.length === 0) return <p className="estado">Sem vendas no período selecionado.</p>;

  return (
    <>
      <Tiles
        itens={[
          { rotulo: "Produtos vendidos", valor: numero(itens.length), linhas: [`${moedaCompacta(total)} em faturamento bruto`] },
          { rotulo: "Classe A", valor: `${a.itens} produtos`, linhas: [`${percentual(a.participacao)} do faturamento`, "Foco de estoque e negociação"] },
          { rotulo: "Classe B", valor: `${b.itens} produtos`, linhas: [`${percentual(b.participacao)} do faturamento`, "Acompanhamento regular"] },
          { rotulo: "Classe C", valor: `${c.itens} produtos`, linhas: [`${percentual(c.participacao)} do faturamento`, "Revisar mix e giro"] },
        ]}
      />
      <div className="grade">
        <GraficoPareto className="col-12" itens={itens} classes={classes} />
        <Cartao className="col-8" titulo="Produtos por classe" subtitulo="Ranking completo do período">
          <div className="rolagem limitada" tabIndex={0} aria-label="Tabela de produtos (role para ver todos)">
            <table className="tabela">
              <thead>
                <tr>
                  <th className="pos">#</th>
                  <th>Produto</th>
                  <th>Classe</th>
                  <th className="direita">Unid.</th>
                  <th className="direita">Faturado</th>
                  <th className="direita">%</th>
                  <th className="direita">% acum.</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i, pos) => (
                  <tr key={i.codigo}>
                    <td className="pos num">{pos + 1}</td>
                    <td>
                      <span className="nome">{i.nome}</span>
                      <span className="detalhe">{i.codigo} · {i.categoria}</span>
                    </td>
                    <td><span className="selo-classe" aria-label={`Classe ${i.classe}`}>{i.classe}</span></td>
                    <td className="direita num">{numero(i.quantidade)}</td>
                    <td className="direita num" title={moedaCompleta(i.valor)}>{moedaCompacta(i.valor)}</td>
                    <td className="direita num">{percentual(i.participacao)}</td>
                    <td className="direita num">{percentual(i.acumulado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>
        <BarrasRanking className="col-4" titulo="Mix por categoria" subtitulo="Faturamento bruto" itens={categorias} rotuloValor="Bruto" />
      </div>
    </>
  );
}
