export interface ReminderRow {
  id: string;
  text: string;
  dueAt: Date;
  userId: string;
}

export function toReminderDto(row: ReminderRow) {
  return { id: row.id, text: row.text, dueAt: row.dueAt.toISOString() };
}

export function isDue(row: ReminderRow): boolean {
  return row.dueAt.getTime() <= Date.now();
}
