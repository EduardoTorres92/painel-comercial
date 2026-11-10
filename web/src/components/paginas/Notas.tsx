import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { buscarNotas, notasParaCsv, type OrdemNotas } from "../../lib/analises";
import { useJson } from "../../lib/dados";
import { mesLongo, moedaCompleta, numero } from "../../lib/formatos";
import type { DadosNotas, Filtros, Painel } from "../../lib/tipos";
import { ComDados } from "../Abas";
import { Cartao } from "../base";

const POR_PAGINA = 25;

export function AbaNotas({ painel, filtros }: { painel: Painel; filtros: Filtros }) {
  const estado = useJson<DadosNotas>(`/data/notas/${filtros.mes}.json`);
  return <ComDados estado={estado}>{(dados) => <Conteudo painel={painel} dados={dados} filtros={filtros} />}</ComDados>;
}

function Conteudo({ painel, dados, filtros }: { painel: Painel; dados: DadosNotas; filtros: Filtros }) {
  const [termo, setTermo] = useState("");
  const [ordem, setOrdem] = useState<OrdemNotas>("data");
  const [pagina, setPagina] = useState(0);
  const termoAdiado = useDeferredValue(termo);

  const resultado = useMemo(() => buscarNotas(painel, dados, filtros, termoAdiado, ordem), [painel, dados, filtros, termoAdiado, ordem]);
  useEffect(() => setPagina(0), [termoAdiado, ordem, filtros]);

  const paginas = Math.max(1, Math.ceil(resultado.length / POR_PAGINA));
  const visiveis = resultado.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const total = resultado.reduce((s, l) => s + l[6], 0);
  const dataBr = (dia: number) => `${String(dia).padStart(2, "0")}/${filtros.mes.slice(5, 7)}`;

  const baixar = () => {
    // BOM para o Excel reconhecer acentos
    const blob = new Blob(["﻿" + notasParaCsv(painel, resultado, filtros.mes)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notas-${filtros.mes}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Cartao titulo="Busca de notas fiscais" subtitulo={`${mesLongo(filtros.mes)} · respeita os filtros de filial e canal`}>
      <form className="busca" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="filtro">
          Buscar
          <input
            type="search"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Número da nota, cliente ou UF"
            aria-describedby="resumo-busca"
          />
        </label>
        <label className="filtro">
          Ordenar por
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as OrdemNotas)}>
            <option value="data">Data de emissão</option>
            <option value="valor">Maior valor</option>
            <option value="devolvido">Maior devolução</option>
          </select>
        </label>
        <button type="button" className="botao" onClick={baixar} disabled={resultado.length === 0}>
          Baixar CSV
        </button>
      </form>
      <p id="resumo-busca" className="tile-linhas" aria-live="polite" style={{ margin: "0 0 8px" }}>
        {numero(resultado.length)} notas · {moedaCompleta(total)}
      </p>
      {resultado.length === 0 ? (
        <p className="estado">Nenhuma nota encontrada{termo ? ` para "${termo}"` : ""}.</p>
      ) : (
        <>
          <div className="rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nota</th>
                  <th>Emissão</th>
                  <th>Cliente</th>
                  <th>UF</th>
                  <th>Filial</th>
                  <th>Canal</th>
                  <th className="direita">Itens</th>
                  <th className="direita">Valor</th>
                  <th className="direita">Devolvido</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={l[0]}>
                    <td className="num">{l[0]}</td>
                    <td className="num">{dataBr(l[1])}</td>
                    <td>{l[4]}</td>
                    <td>{l[5]}</td>
                    <td>{painel.filiais[l[2]]}</td>
                    <td>{painel.canais[l[3]]}</td>
                    <td className="direita num">{l[7]}</td>
                    <td className="direita num">{moedaCompleta(l[6])}</td>
                    <td className="direita num">{l[8] > 0 ? moedaCompleta(l[8]) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="paginacao" aria-label="Paginação">
            <span>
              Página {pagina + 1} de {paginas}
            </span>
            <div>
              <button type="button" className="botao" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
                Anterior
              </button>
              <button type="button" className="botao" disabled={pagina >= paginas - 1} onClick={() => setPagina((p) => p + 1)}>
                Próxima
              </button>
            </div>
          </nav>
        </>
      )}
    </Cartao>
  );
}
