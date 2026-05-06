import { pgTable, text, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { user } from './users.js';

/** Per-user notification preferences. Default row is created on first read. */
export const notificationPreferences = pgTable('notification_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),

  // Comments
  commentsGeneral: boolean('comments_general').notNull().default(true),
  commentsReplies: boolean('comments_replies').notNull().default(true),
  commentsMentions: boolean('comments_mentions').notNull().default(true),

  // Assets
  uploadsYours: boolean('uploads_yours').notNull().default(true),
  uploadsOthers: boolean('uploads_others').notNull().default(false),
  statusUpdates: boolean('status_updates').notNull().default(true),
  assignedToYou: boolean('assigned_to_you').notNull().default(true),
  transcriptionActivity: boolean('transcription_activity').notNull().default(true),

  // Channel toggle
  emailEnabled: boolean('email_enabled').notNull().default(true),

  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Singleton row holding account-wide settings (branding, share defaults). */
export const accountSettings = pgTable('account_settings', {
  id: text('id').primaryKey().default('default'),
  branding: jsonb('branding').notNull().default({}),
  sharesDefaults: jsonb('shares_defaults').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
