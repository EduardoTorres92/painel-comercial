import type { PointerEvent } from "react";
import { escala, mesLongo, numero } from "../lib/formatos";
import { Cartao, Dica, ItemLegenda, useDica, useLargura } from "./base";

interface Props {
  titulo: string;
  subtitulo?: string;
  mes: string;
  mesAnterior: string | null;
  atual: (number | null)[];
  anterior: (number | null)[] | null;
  className?: string;
}

const ALTURA = 240;
const MARGEM = { topo: 16, direita: 56, base: 28, esquerda: 48 };

/** Acumulado dia a dia do mês (destaque) contra o mês anterior (contexto, em cinza). */
export function GraficoComparacao({ titulo, subtitulo, mes, mesAnterior, atual, anterior, className }: Props) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const { dica, mostrar, esconder } = useDica();
  const dias = Math.max(atual.length, anterior?.length ?? 0);
  const maximo = Math.max(...atual.map((v) => v ?? 0), ...(anterior ?? []).map((v) => v ?? 0), 1);
  const { max, ticks } = escala(maximo);
  const larguraPlot = largura - MARGEM.esquerda - MARGEM.direita;
  const alturaPlot = ALTURA - MARGEM.topo - MARGEM.base;
  const x = (dia: number) => MARGEM.esquerda + ((dia - 1) / Math.max(dias - 1, 1)) * larguraPlot;
  const y = (v: number) => MARGEM.topo + alturaPlot - (v / max) * alturaPlot;
  const caminho = (serie: (number | null)[]) =>
    serie
      .map((v, i) => (v === null ? null : `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .map((p, i) => `${i === 0 ? "M" : "L"}${p}`)
      .join("");
  const ultimoAtual = atual.reduce<number>((u, v, i) => (v !== null ? i : u), -1);

  const aoMover = (e: PointerEvent<SVGRectElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    const dia = Math.min(dias, Math.max(1, Math.round(((e.clientX - caixa.left) / caixa.width) * (dias - 1)) + 1));
    const linhas = [];
    if (atual[dia - 1] !== null && atual[dia - 1] !== undefined) linhas.push({ valor: numero(atual[dia - 1]!), rotulo: mesLongo(mes), cor: "var(--serie-1)" });
    if (anterior && mesAnterior && anterior[dia - 1] !== null && anterior[dia - 1] !== undefined)
      linhas.push({ valor: numero(anterior[dia - 1]!), rotulo: mesLongo(mesAnterior), cor: "var(--serie-contexto)" });
    mostrar({ x: x(dia), y: y(Math.max(atual[dia - 1] ?? 0, anterior?.[dia - 1] ?? 0)), titulo: `Até o dia ${dia}`, linhas });
  };

  const legenda = (
    <ul className="legenda">
      <ItemLegenda cor="var(--serie-1)" texto={mesLongo(mes)} tipo="linha" />
      {mesAnterior && <ItemLegenda cor="var(--serie-contexto)" texto={mesLongo(mesAnterior)} tipo="linha" />}
    </ul>
  );

  const tabela = (
    <table className="tabela">
      <thead>
        <tr>
          <th>Dia</th>
          <th className="direita">{mesLongo(mes)}</th>
          {mesAnterior && <th className="direita">{mesLongo(mesAnterior)}</th>}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: dias }, (_, i) => (
          <tr key={i}>
            <td>{i + 1}</td>
            <td className="direita num">{atual[i] !== null && atual[i] !== undefined ? numero(atual[i]!) : "–"}</td>
            {mesAnterior && <td className="direita num">{anterior?.[i] !== null && anterior?.[i] !== undefined ? numero(anterior[i]!) : "–"}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Cartao className={className} titulo={titulo} subtitulo={subtitulo} legenda={legenda} tabela={tabela}>
      <div className="grafico" ref={ref} onPointerLeave={esconder}>
        <svg width={largura} height={ALTURA} role="img" aria-label={titulo}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={MARGEM.esquerda} x2={largura - MARGEM.direita} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--eixo)" : "var(--grade)"} />
              <text x={MARGEM.esquerda - 8} y={y(t)} dy="0.32em" textAnchor="end">{numero(t)}</text>
            </g>
          ))}
          {[1, 5, 10, 15, 20, 25, dias].filter((d, i, a) => d <= dias && a.indexOf(d) === i).map((d) => (
            <text key={d} x={x(d)} y={ALTURA - 8} textAnchor="middle">{d}</text>
          ))}
          {anterior && <path d={caminho(anterior)} fill="none" stroke="var(--serie-contexto)" strokeWidth={2} strokeLinejoin="round" />}
          <path d={caminho(atual)} fill="none" stroke="var(--serie-1)" strokeWidth={2} strokeLinejoin="round" />
          {ultimoAtual >= 0 && (
            <>
              <circle cx={x(ultimoAtual + 1)} cy={y(atual[ultimoAtual]!)} r={4} fill="var(--serie-1)" stroke="var(--superficie)" strokeWidth={2} />
              <text className="rotulo-valor" x={x(ultimoAtual + 1) + 8} y={y(atual[ultimoAtual]!)} dy="0.32em">{numero(atual[ultimoAtual]!)}</text>
            </>
          )}
          <rect className="alvo" x={MARGEM.esquerda} y={MARGEM.topo} width={larguraPlot} height={alturaPlot} fill="transparent" onPointerMove={aoMover} />
        </svg>
        <Dica dica={dica} />
      </div>
    </Cartao>
  );
}
