import { useMemo } from "react";
import { curvaAbc, porMotivo, produtosMaisDevolvidos, taxaDevolucaoMensal, taxaDevolucaoPor } from "../../lib/analises";
import { resumir } from "../../lib/calculos";
import { useJson } from "../../lib/dados";
import { mesCurto, mesLongo, moedaCompacta, moedaCompleta, numero, percentual } from "../../lib/formatos";
import type { DadosDevolucoes, DadosProdutos, Filtros, Painel } from "../../lib/tipos";
import { TODAS, TODOS } from "../../lib/tipos";
import { ComDados, Tiles } from "../Abas";
import { BarrasRanking } from "../BarrasRanking";
import { GraficoColunas } from "../GraficoColunas";
import { Cartao } from "../base";

const PCT = {
  completo: (v: number) => percentual(v, 2),
  compacto: (v: number) => percentual(v),
  eixo: (v: number) => percentual(v, 0),
};

export function AbaDevolucoes({ painel, filtros, onSelecionarMes }: { painel: Painel; filtros: Filtros; onSelecionarMes: (mes: string) => void }) {
  const devolucoes = useJson<DadosDevolucoes>("/data/devolucoes.json");
  const produtos = useJson<DadosProdutos>("/data/produtos.json");
  return (
    <ComDados estado={devolucoes}>
      {(dev) => (
        <ComDados estado={produtos}>
          {(prod) => <Conteudo painel={painel} dev={dev} prod={prod} filtros={filtros} onSelecionarMes={onSelecionarMes} />}
        </ComDados>
      )}
    </ComDados>
  );
}

function Conteudo({
  painel,
  dev,
  prod,
  filtros,
  onSelecionarMes,
}: {
  painel: Painel;
  dev: DadosDevolucoes;
  prod: DadosProdutos;
  filtros: Filtros;
  onSelecionarMes: (mes: string) => void;
}) {
  const resumo = useMemo(() => resumir(painel, filtros), [painel, filtros]);
  const motivos = useMemo(() => porMotivo(dev, filtros), [dev, filtros]);
  const serie = useMemo(() => taxaDevolucaoMensal(painel, filtros), [painel, filtros]);
  const filiais = useMemo(() => taxaDevolucaoPor(painel, filtros, "filial"), [painel, filtros]);
  const canais = useMemo(() => taxaDevolucaoPor(painel, filtros, "canal"), [painel, filtros]);
  const criticos = useMemo(() => produtosMaisDevolvidos(curvaAbc(painel, prod, filtros).itens), [painel, prod, filtros]);
  const principal = motivos.itens[0];
  const media12 = serie.reduce((s, p) => s + p.valor, 0) / Math.max(serie.length, 1);

  return (
    <>
      {resumo.parcial && (
        <p className="aviso">
          Mês em andamento: as devoluções são contadas na data em que acontecem, então o início do mês inclui devoluções de vendas
          anteriores e a taxa tende a parecer maior.
        </p>
      )}
      <Tiles
        itens={[
          { rotulo: "Valor devolvido", valor: moedaCompacta(resumo.devolucoes), titulo: moedaCompleta(resumo.devolucoes), linhas: [`${numero(motivos.notas)} notas com devolução`] },
          { rotulo: "Taxa de devolução", valor: percentual(resumo.taxaDevolucao), linhas: [`Média dos últimos 12 meses: ${percentual(media12)}`] },
          {
            rotulo: "Principal motivo",
            valor: principal && principal.valor > 0 ? principal.nome : "–",
            linhas: principal && principal.valor > 0 ? [`${percentual(principal.participacao)} do valor devolvido`] : ["Sem devoluções no período"],
          },
          {
            rotulo: "Produto mais devolvido",
            valor: criticos[0] ? percentual((criticos[0].devolvido / criticos[0].valor) * 100) : "–",
            linhas: criticos[0] ? [criticos[0].nome, "do que foi vendido"] : [],
          },
        ]}
      />
      <div className="grade">
        <GraficoColunas
          className="col-8"
          titulo="Taxa de devolução por mês"
          subtitulo="Valor devolvido ÷ faturamento bruto · clique para ver o mês"
          pontos={serie.map((p) => ({ rotulo: mesCurto(p.mes), rotuloLongo: mesLongo(p.mes), valor: p.valor }))}
          formatar={PCT}
          rotuloValor="Taxa"
          destaque={serie.length - 1}
          extras={(i) => [{ valor: moedaCompleta(serie[i].devolvido), rotulo: "devolvido" }]}
          onSelecionar={(i) => onSelecionarMes(serie[i].mes)}
        />
        <BarrasRanking className="col-4" titulo="Motivos" subtitulo="Valor devolvido por motivo" itens={motivos.itens} rotuloValor="Devolvido" />
        <BarrasRanking
          className="col-6"
          titulo="Taxa por filial"
          subtitulo={filtros.canal === TODOS ? "% do faturamento bruto" : `% do bruto · ${filtros.canal}`}
          itens={filiais}
          selecionado={filtros.filial !== TODAS ? filtros.filial : undefined}
          formatar={PCT}
          detalhe={(i) => `${moedaCompacta(filiais.find((f) => f.nome === i.nome)?.devolvido ?? 0)} devolvidos`}
          rotuloValor="Taxa"
          comParticipacao={false}
        />
        <BarrasRanking
          className="col-6"
          titulo="Taxa por canal"
          subtitulo={filtros.filial === TODAS ? "% do faturamento bruto" : `% do bruto · ${filtros.filial}`}
          itens={canais}
          selecionado={filtros.canal !== TODOS ? filtros.canal : undefined}
          formatar={PCT}
          detalhe={(i) => `${moedaCompacta(canais.find((c) => c.nome === i.nome)?.devolvido ?? 0)} devolvidos`}
          rotuloValor="Taxa"
          comParticipacao={false}
        />
        <Cartao className="col-12" titulo="Produtos com maior índice de devolução" subtitulo="Valor devolvido ÷ valor vendido no período (produtos com ao menos 0,5% do faturamento)">
          {criticos.length === 0 ? (
            <p className="estado">Sem devoluções no período.</p>
          ) : (
            <div className="rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th className="pos">#</th>
                    <th>Produto</th>
                    <th>Classe ABC</th>
                    <th className="direita">Vendido</th>
                    <th className="direita">Devolvido</th>
                    <th className="direita">Índice</th>
                  </tr>
                </thead>
                <tbody>
                  {criticos.map((p, i) => (
                    <tr key={p.codigo}>
                      <td className="pos num">{i + 1}</td>
                      <td>
                        <span className="nome">{p.nome}</span>
                        <span className="detalhe">{p.codigo} · {p.categoria}</span>
                      </td>
                      <td><span className="selo-classe">{p.classe}</span></td>
                      <td className="direita num">{moedaCompleta(p.valor)}</td>
                      <td className="direita num">{moedaCompleta(p.devolvido)}</td>
                      <td className="direita num">{percentual((p.devolvido / p.valor) * 100, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>
      </div>
    </>
  );
}
