import { defineConfig } from "vite";

const previewPort = Number(process.env.PORT || 4173);

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 3210,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: previewPort,
    allowedHosts: true,
  },
});
