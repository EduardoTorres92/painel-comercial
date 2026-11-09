import type { PontoMensal } from "../lib/calculos";
import { escala, eixoMoeda, mesCurto, mesLongo, moedaCompacta, moedaCompleta, percentual } from "../lib/formatos";
import { Cartao, Dica, ItemLegenda, caminhoBarra, useDica, useLargura } from "./base";

interface Props {
  pontos: PontoMensal[];
  mesSelecionado: string;
  onSelecionar: (mes: string) => void;
  className?: string;
}

const ALTURA = 260;
const MARGEM = { topo: 24, direita: 8, base: 28, esquerda: 52 };

/**
 * Colunas do líquido mensal com a meta como marca horizontal (mesma escala,
 * um só eixo). O mês selecionado fica em destaque; os demais, no tom claro.
 */
export function GraficoEvolucao({ pontos, mesSelecionado, onSelecionar, className }: Props) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const { dica, mostrar, esconder } = useDica();
  const temMeta = pontos.some((p) => p.meta !== null);

  const maximo = Math.max(...pontos.map((p) => Math.max(p.liquido, p.meta ?? 0)), 1);
  const { max, ticks } = escala(maximo);
  const larguraPlot = largura - MARGEM.esquerda - MARGEM.direita;
  const alturaPlot = ALTURA - MARGEM.topo - MARGEM.base;
  const faixa = larguraPlot / Math.max(pontos.length, 1);
  const larguraBarra = Math.min(24, faixa * 0.6);
  const y = (v: number) => MARGEM.topo + alturaPlot - (v / max) * alturaPlot;

  const legenda = (
    <ul className="legenda">
      <ItemLegenda cor="var(--serie-1)" texto="Faturamento líquido" />
      {temMeta && <ItemLegenda cor="var(--serie-meta)" texto="Meta" tipo="linha" />}
    </ul>
  );

  const tabela = (
    <table className="tabela">
      <thead>
        <tr>
          <th>Mês</th>
          <th className="direita">Líquido</th>
          {temMeta && <th className="direita">Meta</th>}
          {temMeta && <th className="direita">Atingimento</th>}
        </tr>
      </thead>
      <tbody>
        {pontos.map((p) => (
          <tr key={p.mes}>
            <td>{mesLongo(p.mes)}</td>
            <td className="direita num">{moedaCompleta(p.liquido)}</td>
            {temMeta && <td className="direita num">{p.meta ? moedaCompleta(p.meta) : "–"}</td>}
            {temMeta && <td className="direita num">{p.meta ? percentual((p.liquido / p.meta) * 100) : "–"}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Cartao
      className={className}
      titulo="Evolução mensal"
      subtitulo="Últimos 12 meses · clique numa coluna para ver o mês"
      legenda={legenda}
      tabela={tabela}
    >
      <div className="grafico" ref={ref} onPointerLeave={esconder}>
        <svg width={largura} height={ALTURA} role="img" aria-label={`Faturamento líquido mensal de ${mesLongo(pontos[0]?.mes ?? "")} a ${mesLongo(pontos[pontos.length - 1]?.mes ?? "")}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={MARGEM.esquerda} x2={largura - MARGEM.direita} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--eixo)" : "var(--grade)"} strokeWidth={1} />
              <text x={MARGEM.esquerda - 8} y={y(t)} dy="0.32em" textAnchor="end">{eixoMoeda(t)}</text>
            </g>
          ))}

          {pontos.map((p, i) => {
            const cx = MARGEM.esquerda + faixa * i + faixa / 2;
            const selecionado = p.mes === mesSelecionado;
            const altura = Math.max(0, y(0) - y(p.liquido));
            const ativar = () =>
              mostrar({
                x: cx,
                y: y(Math.max(p.liquido, p.meta ?? 0)),
                titulo: mesLongo(p.mes),
                linhas: [
                  { valor: moedaCompleta(p.liquido), rotulo: "líquido", cor: "var(--serie-1)" },
                  ...(p.meta
                    ? [
                        { valor: moedaCompleta(p.meta), rotulo: "meta", cor: "var(--serie-meta)" },
                        { valor: percentual((p.liquido / p.meta) * 100), rotulo: "da meta" },
                      ]
                    : []),
                ],
              });
            return (
              <g key={p.mes}>
                <path
                  d={caminhoBarra(cx - larguraBarra / 2, y(p.liquido), larguraBarra, altura, "vertical")}
                  fill={selecionado ? "var(--serie-1)" : "var(--serie-1-suave)"}
                />
                {p.meta !== null && (
                  <line
                    x1={cx - larguraBarra / 2 - 5}
                    x2={cx + larguraBarra / 2 + 5}
                    y1={y(p.meta)}
                    y2={y(p.meta)}
                    stroke="var(--serie-meta)"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                )}
                {selecionado && (
                  <text className="rotulo-valor" x={cx} y={Math.min(y(p.liquido), y(p.meta ?? 0)) - 8} textAnchor="middle">
                    {moedaCompacta(p.liquido)}
                  </text>
                )}
                <text x={cx} y={ALTURA - 8} textAnchor="middle" style={selecionado ? { fill: "var(--texto)", fontWeight: 600 } : undefined}>
                  {mesCurto(p.mes)}
                </text>
                {/* Alvo de toque: a faixa inteira, maior que a barra */}
                <rect
                  className="alvo"
                  x={cx - faixa / 2}
                  y={MARGEM.topo}
                  width={faixa}
                  height={alturaPlot}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${mesLongo(p.mes)}: ${moedaCompleta(p.liquido)}${p.meta ? `, ${percentual((p.liquido / p.meta) * 100)} da meta` : ""}`}
                  aria-pressed={selecionado}
                  onPointerMove={ativar}
                  onFocus={ativar}
                  onBlur={esconder}
                  onClick={() => onSelecionar(p.mes)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelecionar(p.mes);
                    }
                  }}
                />
                <rect
                  className="marca-foco"
                  x={cx - faixa / 2 + 2}
                  y={MARGEM.topo}
                  width={faixa - 4}
                  height={alturaPlot}
                  rx={6}
                  fill="var(--serie-1-lavagem)"
                />
              </g>
            );
          })}
        </svg>
        <Dica dica={dica} />
      </div>
    </Cartao>
  );
}
