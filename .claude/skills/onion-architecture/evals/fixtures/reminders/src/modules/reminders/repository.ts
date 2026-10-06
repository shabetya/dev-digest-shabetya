import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { reminders } from '../../db/schema.js';

export class ReminderRepository {
  async listPending(workspaceId: string) {
    return db
      .select()
      .from(reminders)
      .where(and(eq(reminders.workspaceId, workspaceId), eq(reminders.status, 'pending')));
  }

  async insert(workspaceId: string, userId: string, text: string, dueAt: Date, cancelToken: string) {
    const [row] = await db
      .insert(reminders)
      .values({ workspaceId, userId, text, dueAt, cancelToken })
      .returning();
    return row!;
  }

  async markSent(id: string, sentAt: Date) {
    await db.update(reminders).set({ status: 'sent', sentAt }).where(eq(reminders.id, id));
  }

  async cancel(workspaceId: string, token: string) {
    await db
      .update(reminders)
      .set({ status: 'cancelled' })
      .where(and(eq(reminders.workspaceId, workspaceId), eq(reminders.cancelToken, token)));
  }
}
