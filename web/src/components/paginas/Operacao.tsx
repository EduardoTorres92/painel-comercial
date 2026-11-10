import { useMemo } from "react";
import { leadTime, leadTimePorFilial, notasAcumuladas, pedidosFiltrados, potencialPorFilial } from "../../lib/analises";
import { chaveDe, resumir } from "../../lib/calculos";
import { useJson } from "../../lib/dados";
import { mesLongo, moedaCompacta, moedaCompleta, numero, percentual } from "../../lib/formatos";
import type { DadosOperacao, Filtros, Painel } from "../../lib/tipos";
import { TODOS } from "../../lib/tipos";
import { ComDados, Tiles } from "../Abas";
import { BarrasPotencial } from "../BarrasPotencial";
import { BarrasRanking } from "../BarrasRanking";
import { GraficoColunas } from "../GraficoColunas";
import { GraficoComparacao } from "../GraficoComparacao";
import { Cartao } from "../base";

const INTEIRO = { completo: numero, compacto: numero, eixo: numero };
const DIAS = {
  completo: (v: number) => `${v.toFixed(1).replace(".", ",")} dias úteis`,
  compacto: (v: number) => `${v.toFixed(1).replace(".", ",")} d`,
};
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function AbaOperacao({ painel, filtros }: { painel: Painel; filtros: Filtros }) {
  const estado = useJson<DadosOperacao>("/data/operacao.json");
  return <ComDados estado={estado}>{(dados) => <Conteudo painel={painel} dados={dados} filtros={filtros} />}</ComDados>;
}

function Conteudo({ painel, dados, filtros }: { painel: Painel; dados: DadosOperacao; filtros: Filtros }) {
  const resumo = useMemo(() => resumir(painel, filtros), [painel, filtros]);
  const lt = useMemo(() => leadTime(dados, filtros), [dados, filtros]);
  const ltFiliais = useMemo(() => leadTimePorFilial(painel, dados, filtros), [painel, dados, filtros]);
  const acumuladas = useMemo(() => notasAcumuladas(painel, dados, filtros, resumo.diaCorte), [painel, dados, filtros, resumo.diaCorte]);
  const mesCorrente = painel.corte.slice(0, 7) === filtros.mes;
  const potencial = useMemo(() => potencialPorFilial(painel, dados, filtros), [painel, dados, filtros]);
  const carteira = dados.carteira.resumo[chaveDe(filtros)] ?? { valor: 0, pedidos: 0, porSituacao: [] };
  const pedidos = useMemo(() => pedidosFiltrados(painel, dados, filtros).slice(0, 12), [painel, dados, filtros]);
  const potencialTotal = resumo.liquido + carteira.valor;
  const cobertura = resumo.meta ? (potencialTotal / resumo.meta) * 100 : null;
  const bloqueado = carteira.porSituacao[3] ?? 0;

  return (
    <>
      {!mesCorrente && (
        <p className="aviso">
          A carteira de pedidos é uma foto de {dataBr(painel.corte)}/{painel.corte.slice(0, 4)}; os cartões de carteira e potencial
          aparecem em {mesLongo(painel.corte.slice(0, 7))}. Lead time e notas acumuladas seguem o mês selecionado.
        </p>
      )}
      <Tiles
        itens={[
          ...(mesCorrente
            ? [
                {
                  rotulo: "Carteira em aberto",
                  valor: moedaCompacta(carteira.valor),
                  titulo: moedaCompleta(carteira.valor),
                  linhas: [`${numero(carteira.pedidos)} pedidos com entrega neste mês`, `${moedaCompacta(bloqueado)} com bloqueio de crédito`],
                },
                {
                  rotulo: "Potencial do mês",
                  valor: cobertura !== null ? percentual(cobertura) : moedaCompacta(potencialTotal),
                  linhas:
                    cobertura !== null
                      ? [
                          `da meta, se a carteira for faturada`,
                          `Faturado ${moedaCompacta(resumo.liquido)} + carteira ${moedaCompacta(carteira.valor)}`,
                          resumo.meta !== null && potencialTotal < resumo.meta
                            ? `Faltam ${moedaCompacta(resumo.meta - potencialTotal)} em pedidos novos`
                            : "A carteira já cobre a meta",
                        ]
                      : [`Faturado + carteira`, "As metas são por filial: remova o filtro de canal"],
                },
              ]
            : []),
          { rotulo: "Lead time médio", valor: DIAS.compacto(lt.media).replace(" d", " dias"), linhas: ["úteis, do pedido à nota fiscal"] },
          { rotulo: "Notas em até D+1", valor: percentual(lt.ateD1), linhas: [`${numero(lt.notas)} notas no mês`] },
        ]}
      />
      <div className="grade">
        {mesCorrente && <BarrasPotencial className="col-8" itens={filtros.filial === "Todas" ? potencial : potencial.filter((p) => p.nome === filtros.filial)} />}
        {mesCorrente && (
          <BarrasRanking
            className="col-4"
            titulo="Carteira por situação"
            subtitulo="Valor dos pedidos em aberto"
            itens={dados.carteira.situacoes.map((nome, i) => ({
              nome,
              valor: carteira.porSituacao[i] ?? 0,
              participacao: carteira.valor > 0 ? ((carteira.porSituacao[i] ?? 0) / carteira.valor) * 100 : 0,
            }))}
            rotuloValor="Valor"
          />
        )}
        <GraficoColunas
          className="col-6"
          titulo="Lead time (pedido → nota fiscal)"
          subtitulo="Notas por dias úteis entre o pedido e a emissão"
          pontos={lt.distribuicao.map((q, d) => ({ rotulo: d === 5 ? "D+5 ou +" : `D+${d}`, valor: q }))}
          formatar={INTEIRO}
          rotuloValor="Notas"
          rotularTodas
          extras={(d) => [{ valor: percentual(lt.notas > 0 ? (lt.distribuicao[d] / lt.notas) * 100 : 0), rotulo: "das notas" }]}
        />
        <BarrasRanking
          className="col-6"
          titulo="Lead time médio por filial"
          subtitulo={filtros.canal === TODOS ? "Dias úteis do pedido à nota" : `Dias úteis do pedido à nota · ${filtros.canal}`}
          itens={ltFiliais.map((f) => ({ nome: f.nome, valor: f.media, participacao: f.ateD1 }))}
          selecionado={filtros.filial !== "Todas" ? filtros.filial : undefined}
          formatar={DIAS}
          detalhe={(i) => `${percentual(i.participacao, 0)} em até D+1`}
          rotuloValor="Lead time"
          comParticipacao={false}
        />
        <GraficoComparacao
          className="col-12"
          titulo="Notas fiscais acumuladas no mês"
          subtitulo={resumo.parcial ? `Até o dia ${resumo.diaCorte}, contra o mês anterior inteiro` : "Comparadas ao mês anterior"}
          mes={filtros.mes}
          mesAnterior={acumuladas.mesAnterior}
          atual={acumuladas.atual}
          anterior={acumuladas.anterior}
        />
        {mesCorrente && (
          <Cartao className="col-12" titulo="Maiores pedidos em carteira" subtitulo="Pedidos em aberto com entrega prevista neste mês">
            <div className="rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Filial</th>
                    <th>Canal</th>
                    <th>Situação</th>
                    <th className="direita">Pedido em</th>
                    <th className="direita">Entrega</th>
                    <th className="direita">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((p) => (
                    <tr key={p[0]}>
                      <td className="num">{p[0]}</td>
                      <td>{p[3]}</td>
                      <td>{painel.filiais[p[1]]}</td>
                      <td>{painel.canais[p[2]]}</td>
                      <td>{dados.carteira.situacoes[p[7]]}</td>
                      <td className="direita num">{dataBr(p[5])}</td>
                      <td className="direita num">{dataBr(p[6])}</td>
                      <td className="direita num">{moedaCompleta(p[8])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Cartao>
        )}
      </div>
    </>
  );
}
