import {
  pgTable,
  text,
  real,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { user } from './users.js';
import { assets } from './assets.js';

export const comments = pgTable(
  'comment',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    /** seconds into the asset; null for non-timecode comments */
    timecode: real('timecode'),
    resolved: boolean('resolved').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('comment_asset_idx').on(t.assetId),
    index('comment_parent_idx').on(t.parentId),
  ]
);

export const commentMentions = pgTable(
  'comment_mention',
  {
    commentId: text('comment_id')
      .notNull()
      .references(() => comments.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('mention_comment_idx').on(t.commentId),
    index('mention_user_idx').on(t.userId),
  ]
);
