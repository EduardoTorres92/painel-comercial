import type { ItemAbc, ResumoClasse } from "../lib/analises";
import { LIMITES_ABC } from "../lib/analises";
import { moedaCompacta, moedaCompleta, percentual } from "../lib/formatos";
import { Cartao, Dica, useDica, useLargura } from "./base";

interface Props {
  itens: ItemAbc[];
  classes: ResumoClasse[];
  className?: string;
}

const ALTURA = 280;
const MARGEM = { topo: 34, direita: 40, base: 26, esquerda: 44 };

/**
 * Curva ABC: participação acumulada no faturamento, um ponto por produto (do
 * maior para o menor). As classes são faixas contíguas marcadas pela posição
 * (divisórias e rótulos), não pela cor; a participação individual de cada
 * produto fica na tooltip e na tabela.
 */
export function GraficoPareto({ itens, classes, className }: Props) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const { dica, mostrar, esconder } = useDica();
  const larguraPlot = largura - MARGEM.esquerda - MARGEM.direita;
  const alturaPlot = ALTURA - MARGEM.topo - MARGEM.base;
  const n = Math.max(itens.length, 1);
  const faixa = larguraPlot / n;
  const x = (i: number) => MARGEM.esquerda + faixa * i + faixa / 2;
  const y = (pct: number) => MARGEM.topo + alturaPlot - (pct / 100) * alturaPlot;

  const linha = itens.map((it, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(it.acumulado).toFixed(1)}`).join("");
  // Fronteiras entre classes (entre a última barra de uma e a primeira da seguinte)
  const fronteiras = (["B", "C"] as const)
    .map((c) => itens.findIndex((it) => it.classe === c))
    .filter((i) => i > 0)
    .map((i) => MARGEM.esquerda + faixa * i);
  const inicioFaixas = [MARGEM.esquerda, ...fronteiras];
  const fimFaixas = [...fronteiras, MARGEM.esquerda + larguraPlot];

  const tabela = (
    <table className="tabela">
      <thead>
        <tr>
          <th>Classe</th>
          <th className="direita">Produtos</th>
          <th className="direita">Faturamento</th>
          <th className="direita">% do total</th>
        </tr>
      </thead>
      <tbody>
        {classes.map((c) => (
          <tr key={c.classe}>
            <td>{c.classe}</td>
            <td className="direita num">{c.itens}</td>
            <td className="direita num">{moedaCompleta(c.valor)}</td>
            <td className="direita num">{percentual(c.participacao)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Cartao
      className={className}
      titulo="Curva ABC de produtos"
      subtitulo={`Produtos do maior para o menor faturamento · A até ${LIMITES_ABC.A}% do acumulado, B até ${LIMITES_ABC.B}%`}
      tabela={tabela}
    >
      <div className="grafico" ref={ref} onPointerLeave={esconder}>
        <svg width={largura} height={ALTURA} role="img" aria-label="Curva ABC: participação acumulada no faturamento por produto">
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t}>
              <line x1={MARGEM.esquerda} x2={largura - MARGEM.direita} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--eixo)" : "var(--grade)"} />
              <text x={MARGEM.esquerda - 8} y={y(t)} dy="0.32em" textAnchor="end">{t}%</text>
            </g>
          ))}
          {/* Limites de 80% e 95% */}
          {[LIMITES_ABC.A, LIMITES_ABC.B].map((limite) => (
            <g key={limite}>
              <line x1={MARGEM.esquerda} x2={largura - MARGEM.direita} y1={y(limite)} y2={y(limite)} stroke="var(--eixo)" />
              <text x={largura - MARGEM.direita + 6} y={y(limite)} dy="0.32em">{limite}%</text>
            </g>
          ))}
          {/* Faixas das classes: divisórias e rótulos no topo */}
          {fronteiras.map((fx) => (
            <line key={fx} x1={fx} x2={fx} y1={MARGEM.topo - 22} y2={y(0)} stroke="var(--borda-forte)" />
          ))}
          {classes.map((c, i) =>
            c.itens > 0 && inicioFaixas[i] !== undefined ? (
              <text
                key={c.classe}
                className="rotulo-nome"
                x={(inicioFaixas[i] + fimFaixas[i]) / 2}
                y={MARGEM.topo - 14}
                textAnchor="middle"
                style={{ fontWeight: 600, fill: "var(--texto)" }}
              >
                {fimFaixas[i] - inicioFaixas[i] > 90 ? `Classe ${c.classe} · ${c.itens} itens · ${percentual(c.participacao, 0)}` : c.classe}
              </text>
            ) : null,
          )}

          <path d={`${linha}L${x(itens.length - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill="var(--serie-1-lavagem)" />
          <path d={linha} fill="none" stroke="var(--serie-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {faixa >= 10 &&
            itens.map((it, i) => (
              <circle key={it.codigo} cx={x(i)} cy={y(it.acumulado)} r={4} fill="var(--serie-1)" stroke="var(--superficie)" strokeWidth={2} />
            ))}

          {itens.map((it, i) => {
            const ativar = () =>
              mostrar({
                x: x(i),
                y: y(Math.max(it.acumulado, it.participacao)),
                titulo: `${i + 1}º · ${it.nome}`,
                linhas: [
                  { valor: percentual(it.acumulado), rotulo: "acumulado", cor: "var(--serie-1)" },
                  { valor: percentual(it.participacao), rotulo: "do faturamento" },
                  { valor: moedaCompacta(it.valor), rotulo: `classe ${it.classe}` },
                ],
              });
            return (
              <rect
                key={it.codigo}
                className="alvo"
                x={x(i) - faixa / 2}
                y={MARGEM.topo}
                width={faixa}
                height={alturaPlot}
                fill="transparent"
                tabIndex={i < 40 ? 0 : -1}
                aria-label={`${it.nome}: ${percentual(it.participacao)} do faturamento, ${percentual(it.acumulado)} acumulado, classe ${it.classe}`}
                onPointerMove={ativar}
                onFocus={ativar}
                onBlur={esconder}
              />
            );
          })}
          {[1, ...[5, 10, 15, 20, 25, 30, 35, 40].filter((r) => r <= n)].map((r) => (
            <text key={r} x={x(r - 1)} y={ALTURA - 8} textAnchor="middle">{r}º</text>
          ))}
        </svg>
        <Dica dica={dica} />
      </div>
    </Cartao>
  );
}
