import { escala } from "../lib/formatos";
import { Cartao, Dica, caminhoBarra, useDica, useLargura } from "./base";

export interface PontoColuna {
  rotulo: string;
  /** Rótulo longo para tooltip e tabela (padrão: `rotulo`). */
  rotuloLongo?: string;
  valor: number;
}

interface Props {
  titulo: string;
  subtitulo?: string;
  pontos: PontoColuna[];
  formatar: { completo: (v: number) => string; compacto: (v: number) => string; eixo: (v: number) => string };
  rotuloValor: string;
  /** Índice em destaque (os demais ficam no tom claro). */
  destaque?: number;
  /** Rótulo de valor em todas as colunas (para poucas colunas). */
  rotularTodas?: boolean;
  /** Linhas extras na tooltip. */
  extras?: (i: number) => { valor: string; rotulo: string }[];
  onSelecionar?: (i: number) => void;
  className?: string;
}

const ALTURA = 220;
const MARGEM = { topo: 22, direita: 8, base: 28, esquerda: 48 };

/** Colunas de uma série só; destaque opcional para um ponto. */
export function GraficoColunas({
  titulo,
  subtitulo,
  pontos,
  formatar,
  rotuloValor,
  destaque,
  rotularTodas = false,
  extras,
  onSelecionar,
  className,
}: Props) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const { dica, mostrar, esconder } = useDica();
  const { max, ticks } = escala(Math.max(...pontos.map((p) => p.valor), 0));
  const larguraPlot = largura - MARGEM.esquerda - MARGEM.direita;
  const alturaPlot = ALTURA - MARGEM.topo - MARGEM.base;
  const faixa = larguraPlot / Math.max(pontos.length, 1);
  const larguraBarra = Math.min(24, faixa * 0.6);
  const y = (v: number) => MARGEM.topo + alturaPlot - (v / max) * alturaPlot;

  const tabela = (
    <table className="tabela">
      <thead>
        <tr>
          <th>Período</th>
          <th className="direita">{rotuloValor}</th>
        </tr>
      </thead>
      <tbody>
        {pontos.map((p) => (
          <tr key={p.rotulo}>
            <td>{p.rotuloLongo ?? p.rotulo}</td>
            <td className="direita num">{formatar.completo(p.valor)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Cartao className={className} titulo={titulo} subtitulo={subtitulo} tabela={tabela}>
      <div className="grafico" ref={ref} onPointerLeave={esconder}>
        <svg width={largura} height={ALTURA} role="img" aria-label={titulo}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={MARGEM.esquerda} x2={largura - MARGEM.direita} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--eixo)" : "var(--grade)"} />
              <text x={MARGEM.esquerda - 8} y={y(t)} dy="0.32em" textAnchor="end">{formatar.eixo(t)}</text>
            </g>
          ))}
          {pontos.map((p, i) => {
            const cx = MARGEM.esquerda + faixa * i + faixa / 2;
            const emDestaque = destaque === undefined || destaque === i;
            const ativar = () =>
              mostrar({
                x: cx,
                y: y(p.valor),
                titulo: p.rotuloLongo ?? p.rotulo,
                linhas: [{ valor: formatar.completo(p.valor), rotulo: rotuloValor.toLowerCase(), cor: "var(--serie-1)" }, ...(extras?.(i) ?? [])],
              });
            return (
              <g key={p.rotulo}>
                <path
                  d={caminhoBarra(cx - larguraBarra / 2, y(p.valor), larguraBarra, Math.max(0, y(0) - y(p.valor)), "vertical")}
                  fill={emDestaque ? "var(--serie-1)" : "var(--serie-1-suave)"}
                />
                {(rotularTodas || destaque === i) && (
                  <text className="rotulo-valor" x={cx} y={y(p.valor) - 8} textAnchor="middle">
                    {formatar.compacto(p.valor)}
                  </text>
                )}
                <text x={cx} y={ALTURA - 8} textAnchor="middle" style={destaque === i ? { fill: "var(--texto)", fontWeight: 600 } : undefined}>
                  {p.rotulo}
                </text>
                <rect
                  className="alvo"
                  x={cx - faixa / 2}
                  y={MARGEM.topo}
                  width={faixa}
                  height={alturaPlot}
                  fill="transparent"
                  tabIndex={0}
                  role={onSelecionar ? "button" : undefined}
                  aria-label={`${p.rotuloLongo ?? p.rotulo}: ${formatar.completo(p.valor)}`}
                  onPointerMove={ativar}
                  onFocus={ativar}
                  onBlur={esconder}
                  onClick={() => onSelecionar?.(i)}
                  onKeyDown={(e) => {
                    if (onSelecionar && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onSelecionar(i);
                    }
                  }}
                  style={{ cursor: onSelecionar ? "pointer" : "default" }}
                />
                <rect className="marca-foco" x={cx - faixa / 2 + 2} y={MARGEM.topo} width={faixa - 4} height={alturaPlot} rx={6} fill="var(--serie-1-lavagem)" />
              </g>
            );
          })}
        </svg>
        <Dica dica={dica} />
      </div>
    </Cartao>
  );
}
