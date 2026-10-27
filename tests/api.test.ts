import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { TaskStore } from "../server/store.js";
import { createApp } from "../server/app.js";

const input = {
  title: "Ship the API",
  description: "Verify data survives a restart.",
  status: "backlog",
  priority: "high",
} as const;
test("HTTP create, update, stale-write protection, export, delete, and missing records", async () => {
  const store = new TaskStore(":memory:"),
    server = createApp(store).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const send = (
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    assert.deepEqual(await (await send("/api/tasks")).json(), { tasks: [] });
    const created = await send("/api/tasks", "POST", input);
    assert.equal(created.status, 201);
    const { task } = await created.json();
    assert.equal(task.version, 1);
    const updated = await send("/api/tasks/" + task.id, "PUT", {
      ...input,
      status: "doing",
      version: 1,
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).task.version, 2);
    assert.equal(
      (await send("/api/tasks/" + task.id, "PUT", { ...input, version: 1 }))
        .status,
      409,
    );
    assert.equal(
      (await send("/api/tasks/" + task.id, "DELETE", { version: 1 })).status,
      409,
    );
    const backup = await (await send("/api/export")).json();
    assert.equal(backup.schemaVersion, 1);
    assert.equal(backup.tasks[0].status, "doing");
    assert.equal(
      (await send("/api/tasks/" + task.id, "DELETE", { version: 2 })).status,
      204,
    );
    assert.equal(
      (await send("/api/tasks/" + task.id, "DELETE", { version: 2 })).status,
      404,
    );
    assert.equal(
      (await send("/api/tasks/nope", "PUT", { ...input, version: 1 })).status,
      404,
    );
    assert.equal((await send("/api/unknown")).status, 404);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
});
test("rejects invalid inputs and cross-origin writes", async () => {
  const store = new TaskStore(":memory:"),
    server = createApp(store).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + "/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  try {
    for (const bad of [
      { ...input, title: "   " },
      { ...input, title: "x".repeat(121) },
      { ...input, description: "x".repeat(4001) },
      { ...input, status: "unknown" },
      { ...input, extra: true },
      null,
    ])
      assert.equal((await post(bad)).status, 400);
    assert.equal(
      (await post(input, { Origin: "https://attacker.example" })).status,
      403,
    );
    assert.equal(
      (await post(input, { "Sec-Fetch-Site": "cross-site" })).status,
      403,
    );
    assert.equal(
      (await post(input, { "Content-Type": "text/plain" })).status,
      415,
    );
    assert.equal(
      (await post({ ...input, description: "x".repeat(40000) })).status,
      413,
    );
    assert.equal(
      (
        await fetch(base + "/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        })
      ).status,
      400,
    );
    assert.equal(store.list().length, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
});
test("SQLite persists across reopening and SQL is parameterized", () => {
  const dir = mkdtempSync(join(tmpdir(), "vela-test-")),
    path = join(dir, "test.sqlite");
  try {
    const a = new TaskStore(path);
    const task = a.create({ ...input, title: "Robert'); DROP TABLE tasks;--" });
    a.close();
    const b = new TaskStore(path);
    assert.equal(b.get(task.id)?.title, task.title);
    assert.equal(b.list().length, 1);
    b.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
