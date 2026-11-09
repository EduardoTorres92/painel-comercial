import type { PointerEvent } from "react";
import type { PontoRitmo, Resumo } from "../lib/calculos";
import { escala, eixoMoeda, mesLongo, moedaCompacta, moedaCompleta } from "../lib/formatos";
import { Cartao, Dica, ItemLegenda, useDica, useLargura } from "./base";

interface Props {
  pontos: PontoRitmo[];
  resumo: Resumo;
  className?: string;
}

const ALTURA = 260;
const MARGEM = { topo: 20, direita: 64, base: 28, esquerda: 52 };

/**
 * Ritmo do mês: líquido acumulado dia a dia contra a meta distribuída pelos
 * dias úteis. No mês em andamento, uma linha clara projeta o fechamento.
 */
export function GraficoRitmo({ pontos, resumo, className }: Props) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const { dica, mostrar, esconder } = useDica();
  const temMeta = resumo.meta !== null;
  const ultimo = [...pontos].reverse().find((p) => p.realizado !== null);
  const projecao = resumo.parcial && resumo.projecao !== null && ultimo ? resumo.projecao : null;

  const maximo = Math.max(resumo.meta ?? 0, projecao ?? 0, ultimo?.realizado ?? 0, 1);
  const { max, ticks } = escala(maximo);
  const larguraPlot = largura - MARGEM.esquerda - MARGEM.direita;
  const alturaPlot = ALTURA - MARGEM.topo - MARGEM.base;
  const n = pontos.length;
  const x = (dia: number) => MARGEM.esquerda + ((dia - 1) / Math.max(n - 1, 1)) * larguraPlot;
  const y = (v: number) => MARGEM.topo + alturaPlot - (v / max) * alturaPlot;

  const caminho = (seletor: (p: PontoRitmo) => number | null) =>
    pontos
      .filter((p) => seletor(p) !== null)
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.dia).toFixed(1)},${y(seletor(p)!).toFixed(1)}`)
      .join("");

  const linhaRealizado = caminho((p) => p.realizado);
  const linhaMeta = temMeta ? caminho((p) => p.meta) : "";
  const area = ultimo ? `${linhaRealizado}L${x(ultimo.dia)},${y(0)}L${x(1)},${y(0)}Z` : "";

  const marcasDias = [1, 5, 10, 15, 20, 25, n].filter((d, i, a) => d <= n && a.indexOf(d) === i);

  const aoMover = (e: PointerEvent<SVGRectElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    const relativo = (e.clientX - caixa.left) / caixa.width;
    const dia = Math.min(n, Math.max(1, Math.round(relativo * (n - 1)) + 1));
    const p = pontos[dia - 1];
    const linhas = [];
    if (p.realizado !== null) linhas.push({ valor: moedaCompleta(p.realizado), rotulo: "realizado", cor: "var(--serie-1)" });
    if (p.meta !== null) linhas.push({ valor: moedaCompleta(p.meta), rotulo: "meta até o dia", cor: "var(--serie-meta)" });
    if (p.realizado === null && projecao !== null) linhas.push({ valor: moedaCompacta(projecao), rotulo: "projeção no fim do mês", cor: "var(--serie-projecao)" });
    mostrar({ x: x(dia), y: y(Math.max(p.realizado ?? 0, p.meta ?? 0, p.realizado === null ? projecao ?? 0 : 0)), titulo: `Dia ${dia}`, linhas });
  };

  const legenda = (
    <ul className="legenda">
      <ItemLegenda cor="var(--serie-1)" texto="Realizado (acumulado)" tipo="linha" />
      {temMeta && <ItemLegenda cor="var(--serie-meta)" texto="Meta proporcional" tipo="linha" />}
      {projecao !== null && <ItemLegenda cor="var(--serie-projecao)" texto="Projeção" tipo="linha" />}
    </ul>
  );

  const tabela = (
    <table className="tabela">
      <thead>
        <tr>
          <th>Dia</th>
          <th className="direita">Realizado acumulado</th>
          {temMeta && <th className="direita">Meta proporcional</th>}
        </tr>
      </thead>
      <tbody>
        {pontos.filter((p) => p.realizado !== null).map((p) => (
          <tr key={p.dia}>
            <td>{p.dia}</td>
            <td className="direita num">{moedaCompleta(p.realizado!)}</td>
            {temMeta && <td className="direita num">{moedaCompleta(p.meta ?? 0)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const subtitulo = resumo.parcial
    ? `${mesLongo(resumo.mes)} · dados até o dia ${resumo.diaCorte}`
    : `${mesLongo(resumo.mes)} · mês fechado`;

  return (
    <Cartao className={className} titulo="Ritmo do mês" subtitulo={subtitulo} legenda={legenda} tabela={tabela}>
      <div className="grafico" ref={ref} onPointerLeave={esconder}>
        <svg width={largura} height={ALTURA} role="img" aria-label={`Faturamento líquido acumulado em ${mesLongo(resumo.mes)}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={MARGEM.esquerda} x2={largura - MARGEM.direita} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--eixo)" : "var(--grade)"} />
              <text x={MARGEM.esquerda - 8} y={y(t)} dy="0.32em" textAnchor="end">{eixoMoeda(t)}</text>
            </g>
          ))}
          {marcasDias.map((d) => (
            <text key={d} x={x(d)} y={ALTURA - 8} textAnchor="middle">{d}</text>
          ))}

          <path d={area} fill="var(--serie-1-lavagem)" />
          {temMeta && <path d={linhaMeta} fill="none" stroke="var(--serie-meta)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {projecao !== null && ultimo && (
            <path
              d={`M${x(ultimo.dia)},${y(ultimo.realizado!)}L${x(n)},${y(projecao)}`}
              fill="none"
              stroke="var(--serie-projecao)"
              strokeWidth={2}
              strokeLinecap="round"
            />
          )}
          <path d={linhaRealizado} fill="none" stroke="var(--serie-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {/* Rótulos só nas pontas: realizado, meta e projeção */}
          {ultimo && (
            <>
              <circle cx={x(ultimo.dia)} cy={y(ultimo.realizado!)} r={4} fill="var(--serie-1)" stroke="var(--superficie)" strokeWidth={2} />
              {projecao === null && (
                <text className="rotulo-valor" x={x(ultimo.dia) + 8} y={y(ultimo.realizado!)} dy="0.32em">{moedaCompacta(ultimo.realizado!)}</text>
              )}
            </>
          )}
          {projecao !== null && (
            <>
              <circle cx={x(n)} cy={y(projecao)} r={4} fill="var(--superficie)" stroke="var(--serie-projecao)" strokeWidth={2} />
              <text className="rotulo-valor" x={x(n) + 8} y={y(projecao)} dy="0.32em">{moedaCompacta(projecao)}</text>
            </>
          )}
          {temMeta && resumo.meta !== null && (
            <text x={x(n) + 8} y={y(resumo.meta) + (projecao !== null && Math.abs(y(projecao) - y(resumo.meta)) < 14 ? 14 : 0)} dy="0.32em">
              meta
            </text>
          )}

          <rect
            className="alvo"
            x={MARGEM.esquerda}
            y={MARGEM.topo}
            width={larguraPlot}
            height={alturaPlot}
            fill="transparent"
            onPointerMove={aoMover}
          />
        </svg>
        <Dica dica={dica} />
      </div>
    </Cartao>
  );
}
