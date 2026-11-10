import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";
import type { ExpressionSpecification, GeoJSONSource, Map as MapaGl, MapGeoJSONFeature, MapMouseEvent } from "maplibre-gl";
import type { ItemUf } from "../lib/analises";
import { moedaCompleta, numero, percentual } from "../lib/formatos";
import { Cartao, Dica, useDica } from "./base";
import { GradeEstados, NOMES, RodapeMapa, TabelaEstados, faixaDe, maiorValor } from "./MapaEstados";

/** Caixa que enquadra o Brasil continental e as ilhas oceânicas próximas. */
const BRASIL: [[number, number], [number, number]] = [[-74.2, -33.9], [-34.6, 5.4]];
/** Altura máxima dos estados no modo 3D, em metros (o Brasil tem ~4.300 km de largura). */
const ALTURA_MAXIMA = 650_000;

const TEXTOS_PT = {
  "NavigationControl.ZoomIn": "Aproximar",
  "NavigationControl.ZoomOut": "Afastar",
  "NavigationControl.ResetBearing": "Voltar ao norte (arraste para girar e inclinar)",
  "CooperativeGesturesHandler.WindowsHelpText": "Use Ctrl + rolagem para dar zoom no mapa",
  "CooperativeGesturesHandler.MacHelpText": "Use ⌘ + rolagem para dar zoom no mapa",
  "CooperativeGesturesHandler.MobileHelpText": "Use dois dedos para mover o mapa",
};

/** Contorno forte no estado sob o mouse ou fixado pelo clique. */
const DESTACADO: ExpressionSpecification = [
  "any",
  ["boolean", ["feature-state", "hover"], false],
  ["boolean", ["feature-state", "selecionado"], false],
];

type Malha = FeatureCollection<Geometry, { uf: string; nome: string }>;

/** Cores do tema atual, lidas das variáveis CSS (mudam com claro/escuro). */
function coresDoTema() {
  const css = getComputedStyle(document.documentElement);
  const v = (nome: string) => css.getPropertyValue(nome).trim();
  return {
    faixas: Array.from({ length: 6 }, (_, i) => v(`--seq-${i + 1}`)),
    textoClaro: v("--seq-texto-claro"),
    textoEscuro: v("--seq-texto-escuro"),
    vazio: v("--superficie-suave"),
    fundo: v("--superficie"),
    contorno: v("--superficie"),
    destaque: v("--texto"),
    textoFraco: v("--texto-fraco"),
  };
}

/** Muda quando o tema muda (botão do painel ou preferência do sistema). */
function useVersaoTema() {
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    const subir = () => setVersao((n) => n + 1);
    const obs = new MutationObserver(subir);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const midia = window.matchMedia?.("(prefers-color-scheme: dark)");
    midia?.addEventListener("change", subir);
    return () => {
      obs.disconnect();
      midia?.removeEventListener("change", subir);
    };
  }, []);
  return versao;
}

/** Junta os números do período à malha: cor, altura (3D) e cor do texto de cada estado. */
function comValores(malha: Malha, itens: ItemUf[], cores: ReturnType<typeof coresDoTema>): FeatureCollection {
  const porUf = new Map(itens.map((i) => [i.uf, i]));
  const maior = maiorValor(itens);
  return {
    type: "FeatureCollection",
    features: malha.features.map((f) => {
      const item = porUf.get(f.properties.uf);
      const faixa = item ? faixaDe(item.valor, maior) : 0;
      return {
        ...f,
        properties: {
          ...f.properties,
          valor: item?.valor ?? 0,
          cor: faixa ? cores.faixas[faixa - 1] : cores.vazio,
          corTexto: faixa === 0 ? cores.textoFraco : faixa <= 3 ? cores.textoClaro : cores.textoEscuro,
          altura: item ? Math.max(8_000, (item.valor / maior) * ALTURA_MAXIMA) : 0,
        },
      };
    }),
  };
}

/** Enquadramento do Brasil, já considerando a inclinação e o giro do modo 3D. */
function camera(m: MapaGl, modo3d: boolean) {
  const angulos = { pitch: modo3d ? 52 : 0, bearing: modo3d ? -18 : 0 };
  const base = m.cameraForBounds(BRASIL, { padding: 16, ...angulos });
  return { center: base?.center ?? [-53, -14.5], zoom: (base?.zoom ?? 3) + (modo3d ? 0.35 : 0), ...angulos };
}

type Estado = "carregando" | "pronto" | "sem-webgl";

/**
 * Mapa geográfico do faturamento por estado, com MapLibre GL JS e sem mapa de
 * fundo (não depende de servidor de tiles nem de chave de acesso). Cor em
 * escala sequencial de um tom; no modo 3D, a altura de cada estado também é
 * proporcional ao faturamento. Zoom, arrastar, girar e inclinar; clique num
 * estado para fixar os números dele.
 */
export function MapaBrasil({ itens, className }: { itens: ItemUf[]; className?: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGl | null>(null);
  const malha = useRef<{ estados: Malha; rotulos: Malha } | null>(null);
  const [estado, setEstado] = useState<Estado>("carregando");
  const [modo3d, setModo3d] = useState(false);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const { dica, mostrar, esconder } = useDica();
  const versaoTema = useVersaoTema();
  const itensRef = useRef(itens);
  itensRef.current = itens;

  // Cria o mapa uma vez
  useEffect(() => {
    let cancelado = false;
    let instancia: MapaGl | null = null;
    (async () => {
      const [gl, estados, rotulos] = await Promise.all([
        import("../lib/maplibre"),
        fetch("/geo/brasil-uf.json").then((r) => r.json() as Promise<Malha>),
        fetch("/geo/brasil-uf-rotulos.json").then((r) => r.json() as Promise<Malha>),
      ]);
      if (cancelado || !caixa.current) return;
      malha.current = { estados, rotulos };
      const cores = coresDoTema();
      try {
        instancia = new gl.Map({
          container: caixa.current,
          style: { version: 8, sources: {}, layers: [{ id: "fundo", type: "background", paint: { "background-color": cores.fundo } }] },
          bounds: BRASIL,
          fitBoundsOptions: { padding: 12 },
          maxBounds: [[-100, -50], [-10, 20]],
          minZoom: 2,
          maxZoom: 8,
          maxPitch: 65,
          attributionControl: false,
          cooperativeGestures: true,
          locale: TEXTOS_PT,
        });
      } catch {
        setEstado("sem-webgl");
        return;
      }
      mapa.current = instancia;
      instancia.addControl(new gl.NavigationControl({ visualizePitch: true }), "top-right");

      instancia.on("load", () => {
        const m = instancia!;
        const dados = comValores(estados, itensRef.current, cores);
        m.addSource("estados", { type: "geojson", data: dados, promoteId: "uf" });
        m.addSource("rotulos", { type: "geojson", data: comValores(rotulos, itensRef.current, cores) });
        m.addLayer({ id: "estados-cor", type: "fill", source: "estados", paint: { "fill-color": ["get", "cor"] } });
        m.addLayer({
          id: "estados-contorno",
          type: "line",
          source: "estados",
          paint: {
            "line-color": ["case", DESTACADO, cores.destaque, cores.contorno],
            "line-width": ["case", DESTACADO, 2.5, 0.8],
          },
        });
        m.addLayer({
          id: "estados-3d",
          type: "fill-extrusion",
          source: "estados",
          layout: { visibility: "none" },
          paint: {
            "fill-extrusion-color": ["get", "cor"],
            "fill-extrusion-height": ["get", "altura"],
            "fill-extrusion-opacity": 0.92,
            "fill-extrusion-vertical-gradient": true,
          },
        });
        m.addLayer({
          id: "estados-sigla",
          type: "symbol",
          source: "rotulos",
          layout: { "text-field": ["get", "uf"], "text-size": 11, "text-allow-overlap": false },
          paint: { "text-color": ["get", "corTexto"] },
        });
        setEstado("pronto");
      });

      let emFoco: string | null = null;
      const marcar = (uf: string | null) => {
        if (emFoco === uf) return;
        if (emFoco) instancia!.setFeatureState({ source: "estados", id: emFoco }, { hover: false });
        emFoco = uf;
        if (uf) instancia!.setFeatureState({ source: "estados", id: uf }, { hover: true });
      };
      const aoMover = (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        const uf = e.features?.[0]?.properties?.uf as string | undefined;
        if (!uf) return;
        marcar(uf);
        instancia!.getCanvas().style.cursor = "pointer";
        mostrar(dicaDe(uf, itensRef.current, e.point.x, e.point.y));
      };
      const aoSair = () => {
        marcar(null);
        instancia!.getCanvas().style.cursor = "";
        esconder();
      };
      for (const camada of ["estados-cor", "estados-3d"]) {
        instancia.on("mousemove", camada, aoMover);
        instancia.on("mouseleave", camada, aoSair);
        instancia.on("click", camada, (e) => {
          const uf = e.features?.[0]?.properties?.uf as string | undefined;
          if (uf) setSelecionado((atual) => (atual === uf ? null : uf));
        });
      }
    })().catch(() => !cancelado && setEstado("sem-webgl"));

    return () => {
      cancelado = true;
      instancia?.remove();
      mapa.current = null;
    };
  }, []);

  // Dados do período e cores do tema
  useEffect(() => {
    const m = mapa.current;
    if (estado !== "pronto" || !m || !malha.current) return;
    const cores = coresDoTema();
    m.setPaintProperty("fundo", "background-color", cores.fundo);
    m.setPaintProperty("estados-contorno", "line-color", ["case", DESTACADO, cores.destaque, cores.contorno]);
    (m.getSource("estados") as GeoJSONSource).setData(comValores(malha.current.estados, itens, cores));
    (m.getSource("rotulos") as GeoJSONSource).setData(comValores(malha.current.rotulos, itens, cores));
  }, [estado, itens, versaoTema]);

  // Estado fixado pelo clique: contorno destacado
  useEffect(() => {
    const m = mapa.current;
    if (estado !== "pronto" || !m || !selecionado) return;
    m.setFeatureState({ source: "estados", id: selecionado }, { selecionado: true });
    return () => {
      m.setFeatureState({ source: "estados", id: selecionado }, { selecionado: false });
    };
  }, [estado, selecionado]);

  // 2D ↔ 3D
  useEffect(() => {
    const m = mapa.current;
    if (estado !== "pronto" || !m) return;
    m.setLayoutProperty("estados-3d", "visibility", modo3d ? "visible" : "none");
    m.setLayoutProperty("estados-sigla", "visibility", modo3d ? "none" : "visible");
    m.easeTo({ ...camera(m, modo3d), duration: 900 });
  }, [estado, modo3d]);

  const recentrar = () => {
    if (mapa.current) mapa.current.easeTo({ ...camera(mapa.current, modo3d), duration: 700 });
  };

  const fixado = selecionado ? itens.find((i) => i.uf === selecionado) : undefined;

  const legenda =
    estado === "sem-webgl" ? undefined : (
      <div className="controles-mapa">
        <div className="segmentado" role="group" aria-label="Visualização do mapa">
          <button type="button" aria-pressed={!modo3d} onClick={() => setModo3d(false)}>
            2D
          </button>
          <button type="button" aria-pressed={modo3d} onClick={() => setModo3d(true)}>
            3D
          </button>
        </div>
        <button type="button" className="botao botao-pequeno" onClick={recentrar} disabled={estado !== "pronto"}>
          Recentrar
        </button>
      </div>
    );

  return (
    <Cartao
      className={className}
      titulo="Faturamento por estado"
      subtitulo={
        modo3d
          ? "Bruto por UF do cliente · altura e cor pelo faturamento · arraste com o botão direito para girar"
          : "Bruto por UF do cliente · passe o mouse ou toque num estado"
      }
      legenda={legenda}
      tabela={<TabelaEstados itens={itens} />}
    >
      {estado === "sem-webgl" ? (
        <GradeEstados itens={itens} />
      ) : (
        <div className="mapa-geo-caixa" onPointerLeave={esconder}>
          <div
            ref={caixa}
            className="mapa-geo"
            role="region"
            aria-label="Mapa interativo do faturamento por estado. Os mesmos dados estão na tabela abaixo do mapa."
          />
          {estado === "carregando" && <div className="mapa-carregando">Carregando mapa…</div>}
          <Dica dica={dica} />
        </div>
      )}
      <RodapeMapa itens={itens}>
        {fixado ? (
          <span className="mapa-fixado" role="status">
            <b>{NOMES[fixado.uf]}</b> · {moedaCompleta(fixado.valor)} · {percentual(fixado.participacao)} · {numero(fixado.notas)} notas ·{" "}
            {numero(fixado.clientes)} clientes
            <button type="button" className="limpar-fixado" onClick={() => setSelecionado(null)} aria-label="Limpar estado selecionado">
              ×
            </button>
          </span>
        ) : selecionado ? (
          <span className="mapa-fixado" role="status">
            <b>{NOMES[selecionado]}</b> · sem vendas no período
            <button type="button" className="limpar-fixado" onClick={() => setSelecionado(null)} aria-label="Limpar estado selecionado">
              ×
            </button>
          </span>
        ) : null}
      </RodapeMapa>
    </Cartao>
  );
}

function dicaDe(uf: string, itens: ItemUf[], x: number, y: number) {
  const item = itens.find((i) => i.uf === uf);
  return {
    x,
    y,
    titulo: NOMES[uf] ?? uf,
    linhas: item
      ? [
          { valor: moedaCompleta(item.valor), rotulo: "bruto", cor: "var(--serie-1)" },
          { valor: percentual(item.participacao), rotulo: "do total" },
          { valor: numero(item.notas), rotulo: "notas" },
          { valor: numero(item.clientes), rotulo: "clientes" },
        ]
      : [{ valor: "–", rotulo: "sem vendas no período" }],
  };
}
