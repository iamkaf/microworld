import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://microworld.kaf.sh",
  output: "static",
  vite: {
    plugins: [tailwindcss()],
    server: {
      proxy: {
        "/api": "http://127.0.0.1:8787",
        "/mcp": "http://127.0.0.1:8787",
      },
    },
  },
});
