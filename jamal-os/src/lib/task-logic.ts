// Task rules. Pure functions, unit-tested.

export interface TaskLike {
  scariness: number;
  deferCount: number;
  status: string;
  dueDate?: string | null;
}

export function deferTask<T extends TaskLike>(task: T): T {
  // Immutable update: returns a new object, never mutates.
  return { ...task, deferCount: task.deferCount + 1 };
}

export function isAvoided(task: TaskLike): boolean {
  return task.status !== "done" && task.scariness >= 4 && task.deferCount >= 2;
}

export function isOverdue(task: TaskLike, today: string): boolean {
  return (
    task.status !== "done" && task.dueDate != null && task.dueDate < today
  );
}

export function validateScariness(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}
