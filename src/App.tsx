import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  statuses,
  statusLabels,
  type Task,
  type TaskInput,
  type Priority,
} from "./types";

const blank: TaskInput = {
  title: "",
  description: "",
  status: "backlog",
  priority: "normal",
};
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error || "Request failed."), {
      status: response.status,
    });
  return data as T;
}
function Mark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="23"
      height="23"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 5l9 15L21 5M7 5l5 9 5-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function App() {
  const [tasks, setTasks] = useState<Task[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [priority, setPriority] = useState("all"),
    [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{
    task?: Task;
    input: TaskInput;
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    titleInput = useRef<HTMLInputElement>(null),
    mutationLock = useRef(false);
  async function refresh() {
    setLoading(true);
    try {
      setTasks((await request<{ tasks: Task[] }>("/tasks")).tasks);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    request<{ tasks: Task[] }>("/tasks")
      .then((d) => {
        if (active) setTasks(d.tasks);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (editor && !dialog.current?.open) {
      dialog.current?.showModal();
      titleInput.current?.focus();
    } else if (!editor && dialog.current?.open) dialog.current.close();
  }, [editor]);
  async function mutate(action: () => Promise<void>) {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      if ((e as { status?: number }).status === 409) {
        try {
          const fresh = (await request<{ tasks: Task[] }>("/tasks")).tasks;
          setTasks(fresh);
          setEditor((old) => {
            const latest = fresh.find((t) => t.id === old?.task?.id);
            return old && latest ? { ...old, task: latest } : old;
          });
        } catch {
          /* Retain the last successful board and the unsaved editor. */
        }
      }
      setError((e as Error).message);
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }
  function open(task?: Task) {
    setEditor({
      task,
      input: task
        ? {
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
          }
        : { ...blank },
    });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const current = editor;
    await mutate(async () => {
      const { task } = await request<{ task: Task }>(
        current.task ? `/tasks/${current.task.id}` : "/tasks",
        current.task ? "PUT" : "POST",
        {
          ...current.input,
          ...(current.task ? { version: current.task.version } : {}),
        },
      );
      setTasks((old) =>
        current.task
          ? old.map((t) => (t.id === task.id ? task : t))
          : [task, ...old],
      );
      setEditor(null);
    });
  }
  const visible = tasks.filter(
    (t) =>
      `${t.title} ${t.description}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (priority === "all" || t.priority === priority),
  );
  const completed = tasks.filter((t) => t.status === "done").length;
  return (
    <div className="workspace">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Vela Board home">
          <span className="brand-mark">
            <Mark />
          </span>{" "}
          vela<span className="brand-sub">/ board</span>
        </a>
        <span className="local-badge">
          <span /> Personal workspace
        </span>
        <a className="quiet" href="/api/export" download>
          Export board ↗
        </a>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <p className="eyebrow">MAKE ROOM FOR WHAT MATTERS</p>
            <h1>
              A little more <em>momentum.</em>
            </h1>
            <p className="lede">
              One place for the things you want to move forward.
            </p>
          </div>
          <button
            className="primary"
            onClick={() => open()}
            disabled={loading || busy}
          >
            ＋ New task
          </button>
        </div>
        <div className="toolbar">
          <div className="board-tab">
            Your board <span>{tasks.length}</span>
          </div>
          <div className="filters">
            <label className="search">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search tasks"
                placeholder="Find a task…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Filter priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="all">All priorities</option>
              <option value="high">High priority</option>
              <option value="normal">Normal priority</option>
              <option value="low">Low priority</option>
            </select>
          </div>
        </div>
        {error ? (
          <div className="error" role="alert">
            <span>{error}</span>
            <button onClick={() => void refresh()} disabled={busy}>
              Refresh board
            </button>
          </div>
        ) : null}
        {loading ? (
          <p className="loading" role="status">
            Opening your workspace…
          </p>
        ) : (
          <div className="board">
            {statuses.map((status) => (
              <section
                className={`column ${status}`}
                key={status}
                aria-label={statusLabels[status]}
              >
                <div className="column-heading">
                  <h2>
                    <span className="status-dot" />
                    {statusLabels[status]}
                  </h2>
                  <span className="count">
                    {visible.filter((t) => t.status === status).length}
                  </span>
                </div>
                <div className="task-list">
                  {visible
                    .filter((t) => t.status === status)
                    .map((task) => (
                      <article className="task" key={task.id}>
                        <div className="task-top">
                          <span className={`priority ${task.priority}`}>
                            <span /> {task.priority}
                          </span>
                          <button
                            className="icon-button"
                            aria-label={`Edit ${task.title}`}
                            disabled={busy}
                            onClick={() => open(task)}
                          >
                            ↗
                          </button>
                        </div>
                        <h3>
                          <button
                            className="task-title"
                            onClick={() => open(task)}
                            disabled={busy}
                          >
                            {task.title}
                          </button>
                        </h3>
                        {task.description ? (
                          <p className="task-description">{task.description}</p>
                        ) : null}
                        <div className="task-bottom">
                          <span>
                            {new Date(task.createdAt).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric" },
                            )}
                          </span>
                          <select
                            aria-label={`Status for ${task.title}`}
                            value={task.status}
                            disabled={busy}
                            onChange={(e) =>
                              void mutate(async () => {
                                const { task: updated } = await request<{
                                  task: Task;
                                }>(`/tasks/${task.id}`, "PUT", {
                                  title: task.title,
                                  description: task.description,
                                  priority: task.priority,
                                  status: e.target.value,
                                  version: task.version,
                                });
                                setTasks((old) =>
                                  old.map((t) =>
                                    t.id === updated.id ? updated : t,
                                  ),
                                );
                              })
                            }
                          >
                            {statuses.map((s) => (
                              <option key={s} value={s}>
                                {statusLabels[s]}
                              </option>
                            ))}
                          </select>
                        </div>
                      </article>
                    ))}
                  {visible.filter((t) => t.status === status).length === 0 ? (
                    <div className="empty-column">
                      <span aria-hidden="true">
                        {status === "done" ? "✓" : "＋"}
                      </span>
                      <p>
                        {query || priority !== "all"
                          ? "No matching tasks"
                          : status === "backlog"
                            ? "A fresh start. Add your first task."
                            : status === "doing"
                              ? "Pick something to focus on."
                              : "Small wins belong here."}
                      </p>
                    </div>
                  ) : null}
                </div>
                <button
                  className="add-task"
                  disabled={busy}
                  onClick={() => setEditor({ input: { ...blank, status } })}
                >
                  ＋ Add task
                </button>
              </section>
            ))}
          </div>
        )}
        <footer className="board-footer">
          <span>
            <span className="sync-dot" /> Stored on this device · SQLite
          </span>
          <span>
            {completed} of {tasks.length} completed
          </span>
        </footer>
      </main>
      <dialog
        ref={dialog}
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setEditor(null);
        }}
        onClose={() => {
          if (!busy) setEditor(null);
        }}
        aria-labelledby="editor-title"
      >
        {editor ? (
          <form onSubmit={submit}>
            <fieldset disabled={busy}>
              <div className="dialog-heading">
                <div>
                  <p className="eyebrow">A STEP FORWARD</p>
                  <h2 id="editor-title">
                    {editor.task ? "Edit task" : "What’s next?"}
                  </h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Close editor"
                  onClick={() => setEditor(null)}
                  disabled={busy}
                >
                  ×
                </button>
              </div>
              <label>
                Task title
                <input
                  ref={titleInput}
                  required
                  maxLength={120}
                  value={editor.input.title}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      input: { ...editor.input, title: e.target.value },
                    })
                  }
                  placeholder="Give it a clear next step"
                />
              </label>
              <label>
                Notes <span className="optional">optional</span>
                <textarea
                  maxLength={4000}
                  rows={4}
                  value={editor.input.description}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      input: { ...editor.input, description: e.target.value },
                    })
                  }
                  placeholder="A little context helps…"
                />
              </label>
              <div className="form-row">
                <label>
                  Status
                  <select
                    value={editor.input.status}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        input: {
                          ...editor.input,
                          status: e.target.value as TaskInput["status"],
                        },
                      })
                    }
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {statusLabels[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Priority
                  <select
                    value={editor.input.priority}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        input: {
                          ...editor.input,
                          priority: e.target.value as Priority,
                        },
                      })
                    }
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>
              {error ? (
                <p role="alert" className="dialog-error">
                  {error}
                </p>
              ) : null}
              <div className="dialog-actions">
                {editor.task ? (
                  <button
                    type="button"
                    className="danger"
                    disabled={busy}
                    onClick={() => {
                      const task = editor.task!;
                      if (window.confirm(`Delete “${task.title}”?`))
                        void mutate(async () => {
                          await request(`/tasks/${task.id}`, "DELETE", {
                            version: task.version,
                          });
                          setTasks((old) =>
                            old.filter((t) => t.id !== task.id),
                          );
                          setEditor(null);
                        });
                    }}
                  >
                    Delete task
                  </button>
                ) : (
                  <span />
                )}
                <button
                  className="primary"
                  disabled={busy || !editor.input.title.trim()}
                >
                  {busy
                    ? "Saving…"
                    : editor.task
                      ? "Save changes"
                      : "Create task"}
                </button>
              </div>
            </fieldset>
          </form>
        ) : null}
      </dialog>
    </div>
  );
}
