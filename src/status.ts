import type { Task, TaskStatus } from './types';

/** The forward-only status cycle used by the row checkbox. */
export const STATUS_ORDER: TaskStatus[] = ['todo', 'doing', 'done'];

/**
 * Coerce a task record to a valid status. Legacy records stored a boolean
 * `done`; those migrate to `done`/`todo`.
 */
export function normStatus(t: { status?: unknown; done?: unknown }): TaskStatus {
  if (t.status === 'todo' || t.status === 'doing' || t.status === 'done') return t.status;
  return t.done ? 'done' : 'todo';
}

/** Normalize a raw task list: drop legacy `done`, guarantee a valid `status`. */
export function normTasks(list: unknown): Task[] {
  return (Array.isArray(list) ? list : []).map((raw) => {
    const { done: _done, ...rest } = raw as Task & { done?: boolean };
    return { ...rest, status: normStatus(raw) } as Task;
  });
}

/** Next status in the cycle, wrapping Done → To do. */
export function nextStatus(s: TaskStatus): TaskStatus {
  const i = STATUS_ORDER.indexOf(s);
  return STATUS_ORDER[(i + 1) % STATUS_ORDER.length];
}
