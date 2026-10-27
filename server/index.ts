import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createApp } from "./app.js";
import { TaskStore } from "./store.js";

const dataDir = resolve(process.env.VELA_DATA_DIR || ".data");
mkdirSync(dataDir, { recursive: true });
const store = new TaskStore(resolve(dataDir, "board.sqlite"));
const app = createApp(store);
if (process.argv.includes("--dev")) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const { default: express } = await import("express");
  const dist = resolve("dist");
  app.use(express.static(dist));
  app.get("/", (_req, res) => res.sendFile(resolve(dist, "index.html")));
}
const port = Number(process.env.PORT || 4310);
const server = app.listen(port, "127.0.0.1", () =>
  console.log(`Vela Board → http://127.0.0.1:${port}`),
);
function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
