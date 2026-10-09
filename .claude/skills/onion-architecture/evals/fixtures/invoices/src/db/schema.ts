import { pgTable, uuid, text, integer, timestamp, numeric } from 'drizzle-orm/pg-core';

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  customerId: uuid('customer_id').notNull(),
  status: text('status').notNull().default('draft'),
  dueAt: timestamp('due_at').notNull(),
  lateFee: numeric('late_fee').notNull().default('0'),
  issuedAt: timestamp('issued_at'),
});

export const invoiceLines = pgTable('invoice_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull(),
  description: text('description').notNull(),
  amountCents: integer('amount_cents').notNull(),
});
