import type { PotencialFilial } from "../lib/analises";
import { escala, moedaCompacta, moedaCompleta, percentual } from "../lib/formatos";
import { Cartao, Dica, ItemLegenda, caminhoBarra, useDica, useLargura } from "./base";

const LINHA = 44;
const ESPESSURA = 18;
const GAP = 2;
const MARGEM = { topo: 4, direita: 108, esquerda: 112 };

/** Faturado + carteira em aberto por filial (barras empilhadas), contra a meta. */
export function BarrasPotencial({ itens, className }: { itens: PotencialFilial[]; className?: string }) {
  const [ref, largura] = useLargura<HTMLDivElement>(400);
  const { dica, mostrar, esconder } = useDica();
  const temMeta = itens.some((i) => i.meta);
  const { max } = escala(Math.max(...itens.map((i) => Math.max(i.potencial, i.meta ?? 0)), 1));
  const larguraPlot = largura - MARGEM.esquerda - MARGEM.direita;
  const x = (v: number) => MARGEM.esquerda + (Math.max(v, 0) / max) * larguraPlot;
  const altura = MARGEM.topo + itens.length * LINHA;

  const legenda = (
    <ul className="legenda">
      <ItemLegenda cor="var(--serie-1)" texto="Faturado (líquido)" />
      <ItemLegenda cor="var(--serie-3)" texto="Carteira em aberto" />
      {temMeta && <ItemLegenda cor="var(--serie-meta)" texto="Meta" tipo="linha" />}
    </ul>
  );

  const tabela = (
    <table className="tabela">
      <thead>
        <tr>
          <th>Filial</th>
          <th className="direita">Faturado</th>
          <th className="direita">Carteira</th>
          <th className="direita">Potencial</th>
          {temMeta && <th className="direita">Meta</th>}
          {temMeta && <th className="direita">Cobertura</th>}
        </tr>
      </thead>
      <tbody>
        {itens.map((i) => (
          <tr key={i.nome}>
            <td>{i.nome}</td>
            <td className="direita num">{moedaCompleta(i.faturado)}</td>
            <td className="direita num">{moedaCompleta(i.carteira)}</td>
            <td className="direita num">{moedaCompleta(i.potencial)}</td>
            {temMeta && <td className="direita num">{i.meta ? moedaCompleta(i.meta) : "–"}</td>}
            {temMeta && <td className="direita num">{i.cobertura !== null ? percentual(i.cobertura) : "–"}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Cartao className={className} titulo="Potencial do mês por filial" subtitulo="Faturado até o corte + pedidos em carteira" legenda={legenda} tabela={tabela}>
      <div className="grafico" ref={ref} onPointerLeave={esconder}>
        <svg width={largura} height={altura} role="img" aria-label="Potencial do mês por filial">
          <line x1={x(0)} x2={x(0)} y1={0} y2={altura} stroke="var(--eixo)" />
          {itens.map((item, i) => {
            const meio = MARGEM.topo + i * LINHA + LINHA / 2;
            const topo = meio - ESPESSURA / 2;
            const fimFaturado = x(item.faturado);
            const fimPotencial = x(item.potencial);
            const fimRotulo = Math.max(fimPotencial, item.meta ? x(item.meta) : 0) + 8;
            const detalhe = item.cobertura !== null ? `${percentual(item.cobertura, 0)} da meta` : "sem meta por canal";
            const ativar = () =>
              mostrar({
                x: (x(0) + fimPotencial) / 2,
                y: topo,
                titulo: item.nome,
                linhas: [
                  { valor: moedaCompleta(item.faturado), rotulo: "faturado", cor: "var(--serie-1)" },
                  { valor: moedaCompleta(item.carteira), rotulo: "em carteira", cor: "var(--serie-3)" },
                  ...(item.meta ? [{ valor: moedaCompleta(item.meta), rotulo: "meta", cor: "var(--serie-meta)" }] : []),
                  ...(item.cobertura !== null ? [{ valor: percentual(item.cobertura), rotulo: "da meta coberto" }] : []),
                ],
              });
            return (
              <g key={item.nome}>
                <text className="rotulo-nome" x={MARGEM.esquerda - 10} y={meio} dy="0.32em" textAnchor="end">{item.nome}</text>
                {/* Segmento de base: reto no início, sem ponta arredondada (o segmento seguinte continua a barra) */}
                <rect x={x(0)} y={topo} width={Math.max(0, fimFaturado - x(0) - GAP / 2)} height={ESPESSURA} fill="var(--serie-1)" />
                <path
                  d={caminhoBarra(fimFaturado + GAP / 2, topo, Math.max(0, fimPotencial - fimFaturado - GAP / 2), ESPESSURA, "horizontal")}
                  fill="var(--serie-3)"
                />
                {item.meta ? (
                  <line x1={x(item.meta)} x2={x(item.meta)} y1={topo - 5} y2={topo + ESPESSURA + 5} stroke="var(--serie-meta)" strokeWidth={2} strokeLinecap="round" />
                ) : null}
                <text className="rotulo-valor" x={fimRotulo} y={meio - 6} dy="0.32em">{moedaCompacta(item.potencial)}</text>
                <text x={fimRotulo} y={meio + 8} dy="0.32em">{detalhe}</text>
                <rect
                  className="alvo"
                  x={0}
                  y={meio - LINHA / 2}
                  width={largura}
                  height={LINHA}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${item.nome}: faturado ${moedaCompleta(item.faturado)}, carteira ${moedaCompleta(item.carteira)}, ${detalhe}`}
                  onPointerMove={ativar}
                  onFocus={ativar}
                  onBlur={esconder}
                />
                <rect className="marca-foco" x={2} y={meio - LINHA / 2 + 2} width={largura - 4} height={LINHA - 4} rx={6} fill="var(--serie-1-lavagem)" />
              </g>
            );
          })}
        </svg>
        <Dica dica={dica} />
      </div>
    </Cartao>
  );
}
