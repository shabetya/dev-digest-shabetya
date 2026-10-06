import { db } from './client.js';
import { customers, invoices } from './schema.js';

async function main() {
  const started = Date.now();
  const [customer] = await db
    .insert(customers)
    .values({ workspaceId: '00000000-0000-0000-0000-000000000001', email: 'demo@example.com', stripeCustomerId: 'cus_demo' })
    .returning();
  await db.insert(invoices).values({
    workspaceId: customer!.workspaceId,
    customerId: customer!.id,
    amountCents: 4900,
    paidAt: new Date(),
  });
  console.log('seeded demo data in', Date.now() - started, 'ms');
}

main();
