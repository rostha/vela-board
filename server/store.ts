import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Task, TaskInput } from "../src/types.js";

export const inputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().max(4000),
    status: z.enum(["backlog", "doing", "done"]),
    priority: z.enum(["low", "normal", "high"]),
  })
  .strict();
export const updateSchema = inputSchema.extend({
  version: z.number().int().positive(),
});
export class TaskStore {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('backlog','doing','done')), priority TEXT NOT NULL CHECK(priority IN ('low','normal','high')), version INTEGER NOT NULL DEFAULT 1, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);`);
  }
  list(): Task[] {
    return this.db
      .prepare("SELECT * FROM tasks ORDER BY createdAt DESC, id")
      .all() as unknown as Task[];
  }
  get(id: string): Task | undefined {
    return this.db
      .prepare("SELECT * FROM tasks WHERE id=?")
      .get(id) as unknown as Task | undefined;
  }
  create(input: TaskInput): Task {
    const parsed = inputSchema.parse(input),
      id = randomUUID(),
      now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO tasks VALUES (?,?,?,?,?,1,?,?)")
      .run(
        id,
        parsed.title,
        parsed.description,
        parsed.status,
        parsed.priority,
        now,
        now,
      );
    return this.get(id)!;
  }
  update(id: string, input: TaskInput & { version: number }): Task | null {
    const p = updateSchema.parse(input);
    const result = this.db
      .prepare(
        "UPDATE tasks SET title=?,description=?,status=?,priority=?,version=version+1,updatedAt=? WHERE id=? AND version=?",
      )
      .run(
        p.title,
        p.description,
        p.status,
        p.priority,
        new Date().toISOString(),
        id,
        p.version,
      );
    return result.changes ? this.get(id)! : null;
  }
  delete(id: string, version: number): boolean {
    return Boolean(
      this.db
        .prepare("DELETE FROM tasks WHERE id=? AND version=?")
        .run(id, version).changes,
    );
  }
  close() {
    this.db.close();
  }
}
