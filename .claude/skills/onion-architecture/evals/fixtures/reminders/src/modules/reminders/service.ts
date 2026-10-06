import { randomUUID } from 'node:crypto';
import type { Container } from '../../platform/container.js';
import { isDue, toReminderDto } from './helpers.js';

export class RemindersService {
  constructor(private container: Container) {}

  async create(workspaceId: string, userId: string, text: string, dueAt: Date) {
    const cancelToken = randomUUID();
    const row = await this.container.reminderRepo.insert(workspaceId, userId, text, dueAt, cancelToken);
    return { ...toReminderDto(row), cancelToken };
  }

  async list(workspaceId: string) {
    const rows = await this.container.reminderRepo.listPending(workspaceId);
    return rows.map(toReminderDto);
  }

  async dispatchDue(workspaceId: string) {
    const rows = await this.container.reminderRepo.listPending(workspaceId);
    let sent = 0;
    for (const row of rows.filter(isDue)) {
      const user = await this.container.usersRepo.get(row.userId);
      await this.container.mailer.send(user.email, row.text);
      await this.container.reminderRepo.markSent(row.id, new Date());
      console.log('reminder sent', row.id, user.email);
      sent += 1;
    }
    return sent;
  }
}
