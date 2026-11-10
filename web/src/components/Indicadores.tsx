import type { ReactNode } from "react";
import type { Resumo } from "../lib/calculos";
import { moedaCompacta, moedaCompleta, numero, percentual, variacaoTexto } from "../lib/formatos";
import { Icone } from "./base";

export function Delta({ valor, rotulo, maiorEhMelhor = true }: { valor: number | null; rotulo: string; maiorEhMelhor?: boolean }) {
  if (valor === null) return null;
  const subiu = valor >= 0;
  const classe = Math.abs(valor) < 0.05 ? "neutro" : subiu === maiorEhMelhor ? "bom" : "ruim";
  return (
    <span>
      <span className={`delta ${classe}`}>
        {subiu ? Icone.sobe : Icone.desce}
        {variacaoTexto(valor)}
      </span>{" "}
      {rotulo}
    </span>
  );
}

function Tile({ rotulo, valor, titulo, children }: { rotulo: string; valor: string; titulo?: string; children?: ReactNode }) {
  return (
    <li className="tile">
      <p className="tile-rotulo">{rotulo}</p>
      <p className="tile-valor" title={titulo}>{valor}</p>
      <div className="tile-linhas">{children}</div>
    </li>
  );
}

type Nivel = "bom" | "atencao" | "critico";

function Status({ nivel, texto }: { nivel: Nivel; texto: string }) {
  const icone = nivel === "bom" ? Icone.ok : nivel === "atencao" ? Icone.alerta : Icone.critico;
  return (
    <span className={`status ${nivel}`}>
      {icone}
      {texto}
    </span>
  );
}

const nivelMeta = (pct: number): Nivel => (pct >= 100 ? "bom" : pct >= 90 ? "atencao" : "critico");
const nivelDevolucao = (pct: number): Nivel => (pct <= 2.5 ? "bom" : pct <= 4 ? "atencao" : "critico");
const corNivel: Record<Nivel, string> = { bom: "var(--bom)", atencao: "var(--atencao)", critico: "var(--critico)" };

export function Indicadores({ r }: { r: Resumo }) {
  const comparacaoMes = r.parcial ? "vs mesmos dias do mês anterior" : "vs mês anterior";
  const comparacaoAno = r.parcial ? "vs mesmos dias do ano anterior" : "vs mesmo mês do ano anterior";

  // No mês em andamento, a meta é avaliada pela projeção de fechamento
  const pctMeta = r.parcial ? r.atingimentoProjetado : r.atingimento;

  return (
    <ul className="kpis" aria-label="Indicadores do período">
      <Tile rotulo="Faturamento líquido" valor={moedaCompacta(r.liquido)} titulo={moedaCompleta(r.liquido)}>
        <Delta valor={r.vsMesAnterior} rotulo={comparacaoMes} />
        <Delta valor={r.vsAnoAnterior} rotulo={comparacaoAno} />
        <span title={`Bruto ${moedaCompleta(r.bruto)} + cut-off inicial ${moedaCompleta(r.cutoffInicial)} − cut-off ${moedaCompleta(r.cutoff)} − devoluções ${moedaCompleta(r.devolucoes)}`}>
          {r.parcial ? `Inclui ${moedaCompacta(r.cutoffInicial)} de cut-off inicial` : `Cut-off: +${moedaCompacta(r.cutoffInicial)} / −${moedaCompacta(r.cutoff)}`}
        </span>
      </Tile>

      <Tile
        rotulo={r.parcial ? "Meta · projeção de fechamento" : "Atingimento da meta"}
        valor={pctMeta !== null ? percentual(pctMeta) : "–"}
      >
        {pctMeta !== null && r.meta !== null ? (
          <>
            <div className="medidor" aria-hidden="true">
              <span style={{ width: `${Math.min(pctMeta, 100)}%`, background: corNivel[nivelMeta(pctMeta)] }} />
            </div>
            <span>
              <Status
                nivel={nivelMeta(pctMeta)}
                texto={pctMeta >= 100 ? (r.parcial ? "No ritmo da meta" : "Meta batida") : pctMeta >= 90 ? "Perto da meta" : "Abaixo da meta"}
              />
            </span>
            <span>
              Meta de {moedaCompacta(r.meta)}
              {r.parcial && r.projecao !== null && ` · projeção ${moedaCompacta(r.projecao)}`}
            </span>
          </>
        ) : (
          <span>As metas são por filial. Remova o filtro de canal para comparar.</span>
        )}
      </Tile>

      <Tile rotulo="Ticket médio" valor={moedaCompacta(r.ticketMedio)} titulo={moedaCompleta(r.ticketMedio)}>
        <span>{numero(r.notas)} notas emitidas</span>
        {r.parcial ? <span>Comparação no fechamento do mês</span> : <Delta valor={r.ticketVsMesAnterior} rotulo="vs mês anterior" />}
      </Tile>

      <Tile rotulo="Clientes ativos" valor={numero(r.clientes)}>
        <span>Com ao menos uma nota no período</span>
        {r.parcial ? <span>Comparação no fechamento do mês</span> : <Delta valor={r.clientesVsMesAnterior} rotulo="vs mês anterior" />}
      </Tile>

      <Tile rotulo="Taxa de devolução" valor={percentual(r.taxaDevolucao)}>
        <span>
          <Status
            nivel={nivelDevolucao(r.taxaDevolucao)}
            texto={r.taxaDevolucao <= 2.5 ? "Dentro do esperado" : r.taxaDevolucao <= 4 ? "Acima do esperado" : "Crítica"}
          />
        </span>
        <span>{moedaCompacta(r.devolucoes)} devolvidos</span>
        {r.parcial && <span>No início do mês, devoluções de vendas anteriores pesam mais.</span>}
      </Tile>
    </ul>
  );
}
