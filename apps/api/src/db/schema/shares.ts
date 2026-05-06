import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { user } from './users.js';
import { assets } from './assets.js';

/**
 * Public shareable links to assets. The `id` is also the public URL token
 * - it's a 14-char nanoid which is hard enough to brute-force.
 */
export const shares = pgTable(
  'share',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid(14)),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    title: text('title'),
    /** scrypt-hashed password if a password is required, else null */
    passwordHash: text('password_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    allowDownload: boolean('allow_download').notNull().default(false),
    viewCount: integer('view_count').notNull().default(0),
    lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),
    createdBy: text('created_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('share_asset_idx').on(t.assetId),
    index('share_created_by_idx').on(t.createdBy),
  ]
);
