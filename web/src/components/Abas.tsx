import { useRef, type KeyboardEvent, type ReactNode } from "react";
import type { EstadoDados } from "../lib/dados";

export const ABAS = [
  { id: "geral", rotulo: "Visão geral" },
  { id: "produtos", rotulo: "Produtos" },
  { id: "clientes", rotulo: "Clientes e regiões" },
  { id: "operacao", rotulo: "Operação" },
  { id: "devolucoes", rotulo: "Devoluções" },
  { id: "notas", rotulo: "Notas fiscais" },
] as const;

export type IdAba = (typeof ABAS)[number]["id"];

/** Abas no padrão WAI-ARIA: setas esquerda/direita, Home e End trocam de aba. */
export function NavegacaoAbas({ ativa, onTrocar }: { ativa: IdAba; onTrocar: (aba: IdAba) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const aoTeclar = (e: KeyboardEvent, i: number) => {
    const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ABAS.length - 1 }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    const j = (destino + ABAS.length) % ABAS.length;
    onTrocar(ABAS[j].id);
    refs.current[j]?.focus();
  };
  return (
    <div className="abas" role="tablist" aria-label="Seções do painel">
      {ABAS.map((aba, i) => (
        <button
          key={aba.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`aba-${aba.id}`}
          className="aba"
          aria-selected={ativa === aba.id}
          aria-controls={`painel-${aba.id}`}
          tabIndex={ativa === aba.id ? 0 : -1}
          onClick={() => onTrocar(aba.id)}
          onKeyDown={(e) => aoTeclar(e, i)}
        >
          {aba.rotulo}
        </button>
      ))}
    </div>
  );
}

export function PainelAba({ id, children }: { id: IdAba; children: ReactNode }) {
  return (
    <section role="tabpanel" id={`painel-${id}`} aria-labelledby={`aba-${id}`}>
      {children}
    </section>
  );
}

/** Mostra esqueleto enquanto carrega, mensagem em caso de erro, e o conteúdo quando pronto. */
export function ComDados<T>({ estado, children }: { estado: EstadoDados<T>; children: (dados: T) => ReactNode }) {
  if (estado.tipo === "carregando")
    return (
      <div className="kpis" aria-busy="true" aria-label="Carregando dados">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="esqueleto" />)}
      </div>
    );
  if (estado.tipo === "erro")
    return (
      <p className="estado erro" role="alert">
        Não foi possível carregar os dados desta seção ({estado.mensagem}). Recarregue a página para tentar de novo.
      </p>
    );
  return <>{children(estado.dados)}</>;
}

export interface DadoTile {
  rotulo: string;
  valor: string;
  titulo?: string;
  linhas?: ReactNode[];
}

/** Linha de indicadores simples (rótulo, valor e linhas de apoio). */
export function Tiles({ itens }: { itens: DadoTile[] }) {
  return (
    <ul className="kpis">
      {itens.map((t) => (
        <li key={t.rotulo} className="tile">
          <p className="tile-rotulo">{t.rotulo}</p>
          <p className="tile-valor" title={t.titulo}>{t.valor}</p>
          {t.linhas && (
            <div className="tile-linhas">
              {t.linhas.map((l, i) => <span key={i}>{l}</span>)}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
