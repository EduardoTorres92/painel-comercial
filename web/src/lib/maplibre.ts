/**
 * MapLibre GL JS carregado sob demanda (só na aba que tem mapa).
 * Com bundler, a v6 precisa do endereço do worker definido antes de criar o mapa.
 */
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(workerUrl);

export * from "maplibre-gl";
