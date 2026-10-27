export const statuses = ["backlog", "doing", "done"] as const;
export type Status = (typeof statuses)[number];
export type Priority = "low" | "normal" | "high";
export interface Task {
  id: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export type TaskInput = Pick<
  Task,
  "title" | "description" | "status" | "priority"
>;
export const statusLabels: Record<Status, string> = {
  backlog: "Up next",
  doing: "In progress",
  done: "Completed",
};
