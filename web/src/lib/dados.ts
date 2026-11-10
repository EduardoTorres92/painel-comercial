/** Carregamento sob demanda dos JSONs das abas, com cache em memória por URL. */
import { useEffect, useState } from "react";

export type EstadoDados<T> =
  | { tipo: "carregando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "pronto"; dados: T };

const cache = new Map<string, Promise<unknown>>();

export function carregarJson<T>(url: string): Promise<T> {
  let promessa = cache.get(url);
  if (!promessa) {
    promessa = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    // Falhas não ficam em cache: a próxima tentativa busca de novo
    promessa.catch(() => cache.delete(url));
    cache.set(url, promessa);
  }
  return promessa as Promise<T>;
}

export function useJson<T>(url: string | null): EstadoDados<T> {
  const [estado, setEstado] = useState<EstadoDados<T>>({ tipo: "carregando" });
  useEffect(() => {
    if (!url) return;
    let ativo = true;
    setEstado({ tipo: "carregando" });
    carregarJson<T>(url)
      .then((dados) => ativo && setEstado({ tipo: "pronto", dados }))
      .catch((e: unknown) => ativo && setEstado({ tipo: "erro", mensagem: e instanceof Error ? e.message : String(e) }));
    return () => {
      ativo = false;
    };
  }, [url]);
  return estado;
}
