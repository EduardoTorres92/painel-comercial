import type { ItemRanking } from "../lib/calculos";
import { escala, moedaCompacta, moedaCompleta, percentual } from "../lib/formatos";
import { Cartao, Dica, ItemLegenda, caminhoBarra, useDica, useLargura } from "./base";

interface Props {
  titulo: string;
  subtitulo?: string;
  itens: ItemRanking[];
  /** Item em destaque (filtro ativo); os outros ficam no tom claro. */
  selecionado?: string;
  /** Clique numa barra: aplica o filtro correspondente. */
  onSelecionar?: (nome: string) => void;
  /** Rótulo da coluna de valor na tabela. */
  rotuloValor?: string;
  className?: string;
}

const LINHA = 40;
const ESPESSURA = 16;
const MARGEM = { topo: 4, direita: 112, esquerda: 112 };

/** Barras horizontais ordenadas, uma só cor; com meta, uma marca laranja por barra. */
export function BarrasRanking({ titulo, subtitulo, itens, selecionado, onSelecionar, rotuloValor = "Valor", className }: Props) {
  const [ref, largura] = useLargura<HTMLDivElement>(400);
  const { dica, mostrar, esconder } = useDica();
  const temMeta = itens.some((i) => i.meta);
  const maximo = Math.max(...itens.map((i) => Math.max(i.valor, i.meta ?? 0)), 1);
  const { max } = escala(maximo);
  const larguraPlot = largura - MARGEM.esquerda - MARGEM.direita;
  const x = (v: number) => MARGEM.esquerda + (Math.max(v, 0) / max) * larguraPlot;
  const altura = MARGEM.topo + itens.length * LINHA;

  const legenda = temMeta ? (
    <ul className="legenda">
      <ItemLegenda cor="var(--serie-1)" texto="Líquido" />
      <ItemLegenda cor="var(--serie-meta)" texto="Meta" tipo="linha" />
    </ul>
  ) : undefined;

  const tabela = (
    <table className="tabela">
      <thead>
        <tr>
          <th>Nome</th>
          <th className="direita">{rotuloValor}</th>
          <th className="direita">Participação</th>
          {temMeta && <th className="direita">Meta</th>}
          {temMeta && <th className="direita">Atingimento</th>}
        </tr>
      </thead>
      <tbody>
        {itens.map((i) => (
          <tr key={i.nome}>
            <td>{i.nome}</td>
            <td className="direita num">{moedaCompleta(i.valor)}</td>
            <td className="direita num">{percentual(i.participacao)}</td>
            {temMeta && <td className="direita num">{i.meta ? moedaCompleta(i.meta) : "–"}</td>}
            {temMeta && <td className="direita num">{i.meta ? percentual((i.valor / i.meta) * 100) : "–"}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Cartao className={className} titulo={titulo} subtitulo={subtitulo} legenda={legenda} tabela={tabela}>
      <div className="grafico" ref={ref} onPointerLeave={esconder}>
        <svg width={largura} height={altura} role="img" aria-label={titulo}>
          <line x1={x(0)} x2={x(0)} y1={0} y2={altura} stroke="var(--eixo)" />
          {itens.map((item, i) => {
            const meio = MARGEM.topo + i * LINHA + LINHA / 2;
            const destaque = !selecionado || selecionado === item.nome;
            const rotuloDireita = temMeta && item.meta
              ? `${percentual((item.valor / item.meta) * 100, 0)} da meta`
              : percentual(item.participacao);
            const ativar = () =>
              mostrar({
                x: x(item.valor) - (x(item.valor) - x(0)) / 2,
                y: meio - ESPESSURA / 2,
                titulo: item.nome,
                linhas: [
                  { valor: moedaCompleta(item.valor), rotulo: rotuloValor.toLowerCase(), cor: "var(--serie-1)" },
                  { valor: percentual(item.participacao), rotulo: "do total" },
                  ...(item.meta ? [{ valor: moedaCompleta(item.meta), rotulo: "meta", cor: "var(--serie-meta)" }] : []),
                ],
              });
            return (
              <g key={item.nome}>
                <text className="rotulo-nome" x={MARGEM.esquerda - 10} y={meio} dy="0.32em" textAnchor="end">
                  {item.nome.length > 16 ? `${item.nome.slice(0, 15)}…` : item.nome}
                </text>
                <path
                  d={caminhoBarra(x(0), meio - ESPESSURA / 2, x(item.valor) - x(0), ESPESSURA, "horizontal")}
                  fill={destaque ? "var(--serie-1)" : "var(--serie-1-suave)"}
                />
                {item.meta ? (
                  <line x1={x(item.meta)} x2={x(item.meta)} y1={meio - ESPESSURA / 2 - 5} y2={meio + ESPESSURA / 2 + 5} stroke="var(--serie-meta)" strokeWidth={2} strokeLinecap="round" />
                ) : null}
                <text className="rotulo-valor" x={Math.max(x(item.valor), item.meta ? x(item.meta) : 0) + 8} y={meio - 6} dy="0.32em">
                  {moedaCompacta(item.valor)}
                </text>
                <text x={Math.max(x(item.valor), item.meta ? x(item.meta) : 0) + 8} y={meio + 8} dy="0.32em">
                  {rotuloDireita}
                </text>
                <rect
                  className="alvo"
                  x={0}
                  y={meio - LINHA / 2}
                  width={largura}
                  height={LINHA}
                  fill="transparent"
                  tabIndex={0}
                  role={onSelecionar ? "button" : undefined}
                  aria-label={`${item.nome}: ${moedaCompleta(item.valor)}, ${rotuloDireita}`}
                  aria-pressed={onSelecionar ? selecionado === item.nome : undefined}
                  onPointerMove={ativar}
                  onFocus={ativar}
                  onBlur={esconder}
                  onClick={() => onSelecionar?.(item.nome)}
                  onKeyDown={(e) => {
                    if (onSelecionar && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onSelecionar(item.nome);
                    }
                  }}
                  style={{ cursor: onSelecionar ? "pointer" : "default" }}
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
