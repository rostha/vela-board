import express, { type ErrorRequestHandler } from "express";
import { ZodError, z } from "zod";
import { TaskStore, inputSchema, updateSchema } from "./store.js";

export function createApp(store: TaskStore) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.get("host") || "")) {
      res.status(403).json({ error: "Only local hosts are allowed." });
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      const origin = req.get("Origin");
      if (
        (origin && origin !== `${req.protocol}://${req.get("host")}`) ||
        req.get("Sec-Fetch-Site") === "cross-site"
      ) {
        res.status(403).json({ error: "Cross-origin writes are not allowed." });
        return;
      }
      if (!req.is("application/json")) {
        res.status(415).json({ error: "Use application/json." });
        return;
      }
    }
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  app.get("/api/tasks", (_req, res) => res.json({ tasks: store.list() }));
  app.post("/api/tasks", (req, res) =>
    res.status(201).json({ task: store.create(inputSchema.parse(req.body)) }),
  );
  app.put("/api/tasks/:id", (req, res) => {
    const input = updateSchema.parse(req.body);
    if (!store.get(req.params.id)) {
      res.status(404).json({ error: "Task no longer exists." });
      return;
    }
    const task = store.update(req.params.id, input);
    if (!task) {
      res
        .status(409)
        .json({
          error:
            "This task changed in another tab. The board has been refreshed; review your edit before saving again.",
        });
      return;
    }
    res.json({ task });
  });
  app.delete("/api/tasks/:id", (req, res) => {
    const { version } = z
      .object({ version: z.number().int().positive() })
      .strict()
      .parse(req.body);
    if (!store.get(req.params.id)) {
      res.status(404).json({ error: "Task no longer exists." });
      return;
    }
    if (!store.delete(req.params.id, version)) {
      res
        .status(409)
        .json({ error: "This task changed. Refresh before deleting it." });
      return;
    }
    res.status(204).end();
  });
  app.get("/api/export", (_req, res) =>
    res
      .attachment("vela-board.json")
      .json({ schemaVersion: 1, tasks: store.list() }),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Unknown API route." }),
  );
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) {
      res
        .status(400)
        .json({
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        });
      return;
    }
    if (error?.type === "entity.too.large") {
      res.status(413).json({ error: "Request too large." });
      return;
    }
    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({ error: "Invalid JSON." });
      return;
    }
    console.error(
      "Request failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    res
      .status(500)
      .json({
        error: "Unable to save. Your data has not been discarded; try again.",
      });
  };
  app.use(errors);
  return app;
}
