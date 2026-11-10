import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // O MapLibre (~1,1 MB) fica num pedaço separado, baixado só na aba que tem o mapa.
    chunkSizeWarningLimit: 1200,
  },
});
