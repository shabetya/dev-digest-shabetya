import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { customers } from '../../db/schema.js';

export class CustomerRepository {
  async get(workspaceId: string, id: string) {
    const [row] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.workspaceId, workspaceId), eq(customers.id, id)));
    return row;
  }
}
