import { useEffect, useMemo, useState } from "react";
import { BarrasRanking } from "./components/BarrasRanking";
import { GraficoEvolucao } from "./components/GraficoEvolucao";
import { GraficoRitmo } from "./components/GraficoRitmo";
import { Indicadores } from "./components/Indicadores";
import { ABAS, NavegacaoAbas, PainelAba, type IdAba } from "./components/Abas";
import { Icone } from "./components/base";
import { AbaClientes } from "./components/paginas/Clientes";
import { AbaDevolucoes } from "./components/paginas/Devolucoes";
import { AbaNotas } from "./components/paginas/Notas";
import { AbaOperacao } from "./components/paginas/Operacao";
import { AbaProdutos } from "./components/paginas/Produtos";
import { filtrosPadrao, porCanal, porFilial, resumir, ritmoDoMes, serieMensal } from "./lib/calculos";
import { mesLongo } from "./lib/formatos";
import { TODAS, TODOS, type Filtros, type Painel } from "./lib/tipos";

type Estado = { tipo: "carregando" } | { tipo: "erro"; mensagem: string } | { tipo: "pronto"; painel: Painel };

export function App() {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });

  useEffect(() => {
    let ativo = true;
    fetch("/data/painel.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Painel>;
      })
      .then((painel) => ativo && setEstado({ tipo: "pronto", painel }))
      .catch((e: unknown) => ativo && setEstado({ tipo: "erro", mensagem: e instanceof Error ? e.message : String(e) }));
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <div className="pagina">
      <Topo empresa={estado.tipo === "pronto" ? estado.painel.empresa : "Grão Norte Distribuidora"} />
      {estado.tipo === "pronto" && <Conteudo painel={estado.painel} />}
      {estado.tipo === "carregando" && (
        <div className="kpis" aria-busy="true" aria-label="Carregando dados" style={{ marginTop: 20 }}>
          {Array.from({ length: 5 }, (_, i) => <div key={i} className="esqueleto" />)}
        </div>
      )}
      {estado.tipo === "erro" && (
        <p className="estado erro" role="alert">
          Não foi possível carregar os dados ({estado.mensagem}). Recarregue a página para tentar de novo.
        </p>
      )}
      <footer className="rodape">
        Projeto de portfólio. A Grão Norte Distribuidora e todos os números são fictícios, gerados por um script
        Python com sazonalidade, crescimento e devoluções realistas.
      </footer>
    </div>
  );
}

function Topo({ empresa }: { empresa: string }) {
  const [tema, setTema] = useTema();
  return (
    <header className="topo">
      <div className="marca">
        <div className="logo" aria-hidden="true">GN</div>
        <div>
          <h1>Painel comercial</h1>
          <p>{empresa}</p>
        </div>
      </div>
      <div className="acoes-topo">
        <span className="selo">Dados fictícios</span>
        <button
          type="button"
          className="botao"
          onClick={() => setTema(tema === "dark" ? "light" : "dark")}
          aria-label={tema === "dark" ? "Usar tema claro" : "Usar tema escuro"}
        >
          {tema === "dark" ? Icone.sol : Icone.lua}
          {tema === "dark" ? "Claro" : "Escuro"}
        </button>
      </div>
    </header>
  );
}

function Conteudo({ painel }: { painel: Painel }) {
  const [filtros, setFiltros, aba, setAba] = useFiltrosNaUrl(painel);
  const atualizar = (parcial: Partial<Filtros>) => setFiltros({ ...filtros, ...parcial });
  const alternar = (campo: "filial" | "canal", valor: string, todos: string) =>
    atualizar({ [campo]: filtros[campo] === valor ? todos : valor });

  const resumo = useMemo(() => resumir(painel, filtros), [painel, filtros]);
  const evolucao = useMemo(() => serieMensal(painel, filtros), [painel, filtros]);
  const ritmo = useMemo(() => ritmoDoMes(painel, filtros, resumo), [painel, filtros, resumo]);
  const canais = useMemo(() => porCanal(painel, filtros), [painel, filtros]);
  const filiais = useMemo(() => porFilial(painel, filtros), [painel, filtros]);

  const recorte = [filtros.filial !== TODAS && filtros.filial, filtros.canal !== TODOS && filtros.canal].filter(Boolean).join(" · ");
  const padrao = filtrosPadrao(painel);
  const alterado = filtros.mes !== padrao.mes || filtros.filial !== TODAS || filtros.canal !== TODOS;

  return (
    <main>
      <form className="filtros" aria-label="Filtros" onSubmit={(e) => e.preventDefault()}>
        <label className="filtro">
          Mês
          <select value={filtros.mes} onChange={(e) => atualizar({ mes: e.target.value })}>
            {[...painel.meses].reverse().map((m) => (
              <option key={m} value={m}>{mesLongo(m)}</option>
            ))}
          </select>
        </label>
        <label className="filtro">
          Filial
          <select value={filtros.filial} onChange={(e) => atualizar({ filial: e.target.value })}>
            <option value={TODAS}>Todas as filiais</option>
            {painel.filiais.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="filtro">
          Canal
          <select value={filtros.canal} onChange={(e) => atualizar({ canal: e.target.value })}>
            <option value={TODOS}>Todos os canais</option>
            {painel.canais.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <button type="button" className="botao" disabled={!alterado} onClick={() => setFiltros(padrao)}>
          Limpar filtros
        </button>
        <p className="contexto" aria-live="polite">
          {mesLongo(filtros.mes)}
          {recorte ? ` · ${recorte}` : ""}
          {resumo.parcial ? ` · parcial até o dia ${resumo.diaCorte}` : ""}
        </p>
      </form>

      <NavegacaoAbas ativa={aba} onTrocar={setAba} />

      {aba === "geral" && (
      <PainelAba id="geral">
      <Indicadores r={resumo} />

      <div className="grade">
        <GraficoRitmo className="col-8" pontos={ritmo} resumo={resumo} />
        <BarrasRanking
          className="col-4"
          titulo="Filiais"
          subtitulo={
            filtros.canal !== TODOS
              ? `Líquido em ${filtros.canal} · clique para filtrar`
              : resumo.parcial
                ? `Líquido e meta até o dia ${resumo.diaCorte} · clique para filtrar`
                : "Líquido e meta · clique para filtrar"
          }
          itens={filiais}
          selecionado={filtros.filial !== TODAS ? filtros.filial : undefined}
          onSelecionar={(nome) => alternar("filial", nome, TODAS)}
          rotuloValor="Líquido"
        />
        <GraficoEvolucao className="col-8" pontos={evolucao} mesSelecionado={filtros.mes} onSelecionar={(mes) => atualizar({ mes })} />
        <BarrasRanking
          className="col-4"
          titulo="Canais de venda"
          subtitulo="Líquido por canal · clique para filtrar"
          itens={canais}
          selecionado={filtros.canal !== TODOS ? filtros.canal : undefined}
          onSelecionar={(nome) => alternar("canal", nome, TODOS)}
          rotuloValor="Líquido"
        />
      </div>
      </PainelAba>
      )}
      {aba === "produtos" && (
        <PainelAba id="produtos">
          <AbaProdutos painel={painel} filtros={filtros} />
        </PainelAba>
      )}
      {aba === "clientes" && (
        <PainelAba id="clientes">
          <AbaClientes painel={painel} filtros={filtros} onSelecionarMes={(mes) => atualizar({ mes })} />
        </PainelAba>
      )}
      {aba === "operacao" && (
        <PainelAba id="operacao">
          <AbaOperacao painel={painel} filtros={filtros} />
        </PainelAba>
      )}
      {aba === "devolucoes" && (
        <PainelAba id="devolucoes">
          <AbaDevolucoes painel={painel} filtros={filtros} onSelecionarMes={(mes) => atualizar({ mes })} />
        </PainelAba>
      )}
      {aba === "notas" && (
        <PainelAba id="notas">
          <AbaNotas painel={painel} filtros={filtros} />
        </PainelAba>
      )}
    </main>
  );
}

/** Filtros e aba na query string, para compartilhar uma visão por link. */
function useFiltrosNaUrl(painel: Painel) {
  const [aba, setAba] = useState<IdAba>(() => {
    const valor = new URLSearchParams(window.location.search).get("aba");
    return ABAS.some((a) => a.id === valor) ? (valor as IdAba) : "geral";
  });
  const [filtros, setFiltros] = useState<Filtros>(() => {
    const p = new URLSearchParams(window.location.search);
    const padrao = filtrosPadrao(painel);
    const mes = p.get("mes");
    const filial = p.get("filial");
    const canal = p.get("canal");
    return {
      mes: mes && painel.meses.includes(mes) ? mes : padrao.mes,
      filial: filial && painel.filiais.includes(filial) ? filial : TODAS,
      canal: canal && painel.canais.includes(canal) ? canal : TODOS,
    };
  });

  useEffect(() => {
    const p = new URLSearchParams();
    if (aba !== "geral") p.set("aba", aba);
    if (filtros.mes !== filtrosPadrao(painel).mes) p.set("mes", filtros.mes);
    if (filtros.filial !== TODAS) p.set("filial", filtros.filial);
    if (filtros.canal !== TODOS) p.set("canal", filtros.canal);
    const busca = p.toString();
    window.history.replaceState(null, "", busca ? `?${busca}` : window.location.pathname);
  }, [filtros, painel, aba]);

  return [filtros, setFiltros, aba, setAba] as const;
}

/** Tema claro/escuro: segue o sistema até a pessoa escolher; a escolha fica salva no navegador. */
function useTema() {
  const [tema, setTema] = useState<"light" | "dark">(() => {
    try {
      const salvo = localStorage.getItem("tema");
      if (salvo === "light" || salvo === "dark") return salvo;
    } catch {
      /* armazenamento indisponível */
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = tema;
  }, [tema]);

  const escolher = (novo: "light" | "dark") => {
    setTema(novo);
    try {
      localStorage.setItem("tema", novo);
    } catch {
      /* armazenamento indisponível */
    }
  };
  return [tema, escolher] as const;
}
