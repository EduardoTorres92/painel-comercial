/** Peças compartilhadas pelos gráficos: largura responsiva, tooltip, cartão e ícones. */
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Largura do elemento, atualizada quando o layout muda. */
export function useLargura<T extends HTMLElement>(inicial = 600) {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(inicial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([entrada]) => setLargura(Math.max(260, Math.floor(entrada.contentRect.width))));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, largura] as const;
}

export interface LinhaDica {
  valor: string;
  rotulo: string;
  /** Cor da chave (linha curta); omitida para linhas sem série. */
  cor?: string;
}

export interface EstadoDica {
  x: number;
  y: number;
  titulo: string;
  linhas: LinhaDica[];
}

/** Tooltip: o valor vem primeiro, o nome da série depois. */
export function Dica({ dica }: { dica: EstadoDica | null }) {
  if (!dica) return null;
  return (
    <div className="dica" style={{ left: dica.x, top: dica.y }} role="status">
      <p className="dica-titulo">{dica.titulo}</p>
      {dica.linhas.map((l) => (
        <div key={l.rotulo} className="dica-linha">
          {l.cor && <span className="chave-linha" style={{ background: l.cor }} aria-hidden="true" />}
          <strong>{l.valor}</strong>
          <span>{l.rotulo}</span>
        </div>
      ))}
    </div>
  );
}

export function useDica() {
  const [dica, setDica] = useState<EstadoDica | null>(null);
  return { dica, mostrar: setDica, esconder: () => setDica(null) };
}

interface CartaoProps {
  titulo: string;
  subtitulo?: string;
  legenda?: ReactNode;
  tabela?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Cartão com título, legenda opcional e a versão em tabela dos dados. */
export function Cartao({ titulo, subtitulo, legenda, tabela, className = "", children }: CartaoProps) {
  return (
    <section className={`cartao ${className}`} aria-label={titulo}>
      <div className="cartao-cabeca">
        <div>
          <h2>{titulo}</h2>
          {subtitulo && <p>{subtitulo}</p>}
        </div>
        {legenda}
      </div>
      {children}
      {tabela && (
        <details className="ver-tabela">
          <summary>Ver dados em tabela</summary>
          {tabela}
        </details>
      )}
    </section>
  );
}

export function ItemLegenda({ cor, texto, tipo = "barra" }: { cor: string; texto: string; tipo?: "barra" | "linha" }) {
  return (
    <li>
      <span className={tipo === "barra" ? "chave-barra" : "chave-linha"} style={{ background: cor }} aria-hidden="true" />
      {texto}
    </li>
  );
}

/** Retângulo com cantos de 4px só na ponta dos dados (base reta). */
export function caminhoBarra(x: number, y: number, w: number, h: number, orientacao: "vertical" | "horizontal") {
  if (w <= 0 || h <= 0) return "";
  if (orientacao === "vertical") {
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }
  const r = Math.min(4, h / 2, w);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

export const Icone = {
  sobe: (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 2.5 10 8H2z" fill="currentColor" />
    </svg>
  ),
  desce: (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 9.5 2 4h8z" fill="currentColor" />
    </svg>
  ),
  ok: (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="m2.5 6.2 2.2 2.2 4.8-4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  alerta: (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 1.5 11 10.5H1z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6 5v2.4M6 8.8v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  critico: (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 3.6v2.8M6 8.2v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  sol: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  lua: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M13.5 9.6A5.5 5.5 0 1 1 6.4 2.5a4.3 4.3 0 0 0 7.1 7.1Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
};
