import { useMemo } from "react";
import { clientesPorMes, porEstado } from "../../lib/analises";
import { topClientes } from "../../lib/calculos";
import { useJson } from "../../lib/dados";
import { mesCurto, mesLongo, moedaCompacta, numero, percentual } from "../../lib/formatos";
import type { DadosClientes, Filtros, Painel } from "../../lib/tipos";
import { ComDados, Tiles } from "../Abas";
import { BarrasRanking } from "../BarrasRanking";
import { GraficoColunas } from "../GraficoColunas";
import { MapaEstados } from "../MapaEstados";
import { TabelaTop } from "../TabelaTop";

const INTEIRO = { completo: numero, compacto: numero, eixo: numero };

export function AbaClientes({ painel, filtros, onSelecionarMes }: { painel: Painel; filtros: Filtros; onSelecionarMes: (mes: string) => void }) {
  const estado = useJson<DadosClientes>("/data/clientes.json");
  return (
    <ComDados estado={estado}>
      {(dados) => <Conteudo painel={painel} dados={dados} filtros={filtros} onSelecionarMes={onSelecionarMes} />}
    </ComDados>
  );
}

function Conteudo({
  painel,
  dados,
  filtros,
  onSelecionarMes,
}: {
  painel: Painel;
  dados: DadosClientes;
  filtros: Filtros;
  onSelecionarMes: (mes: string) => void;
}) {
  const estados = useMemo(() => porEstado(dados, filtros), [dados, filtros]);
  const clientes = useMemo(() => topClientes(painel, filtros), [painel, filtros]);
  const ativos = useMemo(() => clientesPorMes(painel, filtros), [painel, filtros]);
  const nacionais = estados.filter((e) => e.uf !== "EX");
  const principal = nacionais[0];
  const top3 = nacionais.slice(0, 3).reduce((s, e) => s + e.participacao, 0);
  const clientesMes = ativos[ativos.length - 1]?.valor ?? 0;

  return (
    <>
      <Tiles
        itens={[
          { rotulo: "Clientes ativos", valor: numero(clientesMes), linhas: [`Com nota em ${mesLongo(filtros.mes)}`] },
          { rotulo: "Estados atendidos", valor: numero(nacionais.length), linhas: [estados.some((e) => e.uf === "EX") ? "Além de vendas para o exterior" : "Só mercado interno"] },
          {
            rotulo: "Principal estado",
            valor: principal ? principal.uf : "–",
            linhas: principal ? [`${percentual(principal.participacao)} do faturamento`, moedaCompacta(principal.valor)] : [],
          },
          { rotulo: "Concentração (3 maiores estados)", valor: percentual(top3), linhas: ["do faturamento bruto"] },
        ]}
      />
      <div className="grade">
        <MapaEstados className="col-8" itens={estados} />
        <BarrasRanking
          className="col-4"
          titulo="Estados"
          subtitulo="10 maiores por faturamento bruto"
          itens={nacionais.slice(0, 10).map((e) => ({ nome: e.uf, valor: e.valor, participacao: e.participacao }))}
          rotuloValor="Bruto"
        />
        <TabelaTop className="col-6" titulo="Maiores clientes" subtitulo="Top 8 por faturamento bruto" linhas={clientes} rotuloExtra="Notas" />
        <GraficoColunas
          className="col-6"
          titulo="Clientes ativos por mês"
          subtitulo="Clientes distintos com nota · clique para ver o mês"
          pontos={ativos.map((a) => ({ rotulo: mesCurto(a.mes), rotuloLongo: mesLongo(a.mes), valor: a.valor }))}
          formatar={INTEIRO}
          rotuloValor="Clientes"
          destaque={ativos.length - 1}
          onSelecionar={(i) => onSelecionarMes(ativos[i].mes)}
        />
      </div>
    </>
  );
}
