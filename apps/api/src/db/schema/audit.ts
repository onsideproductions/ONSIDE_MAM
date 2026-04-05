import { pgTable, text, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { users } from './users';

export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    userId: text('user_id').references(() => users.id),
    action: varchar('action', { length: 50 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: text('entity_id'),
    details: jsonb('details').default({}),
    ipAddress: varchar('ip_address', { length: 45 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_user_idx').on(table.userId),
    index('audit_log_entity_idx').on(table.entityType, table.entityId),
    index('audit_log_created_at_idx').on(table.createdAt),
  ]
);
