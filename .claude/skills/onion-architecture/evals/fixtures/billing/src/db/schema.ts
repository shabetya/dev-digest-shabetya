import { pgTable, uuid, text, integer, timestamp, boolean } from 'drizzle-orm/pg-core';

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  email: text('email').notNull(),
  stripeCustomerId: text('stripe_customer_id').notNull(),
});

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  customerId: uuid('customer_id').notNull(),
  amountCents: integer('amount_cents').notNull(),
  status: text('status').notNull().default('open'),
  paymentRef: text('payment_ref'),
  receiptStatus: text('receipt_status').notNull().default('pending'),
  receiptSent: boolean('receipt_sent').notNull().default(false),
  paidAt: timestamp('paid_at'),
});
