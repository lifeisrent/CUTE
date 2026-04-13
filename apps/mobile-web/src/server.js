import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = Number(process.env.PORT || 3200);
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";

app.use(express.static(path.join(__dirname, "../public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "mobile-web", apiBaseUrl: API_BASE_URL });
});

app.get("/config", (_req, res) => {
  res.json({ apiBaseUrl: API_BASE_URL });
});

app.listen(PORT, () => {
  console.log(`[mobile-web] listening on :${PORT}`);
});
