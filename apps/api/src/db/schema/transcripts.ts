import { pgTable, text, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { assets } from './assets.js';

export interface TranscriptSegment {
  start: number; // seconds
  end: number;
  text: string;
}

export const transcripts = pgTable('transcript', {
  assetId: text('asset_id')
    .primaryKey()
    .references(() => assets.id, { onDelete: 'cascade' }),
  language: varchar('language', { length: 10 }).notNull().default('en'),
  fullText: text('full_text').notNull().default(''),
  /** array of { start, end, text } */
  segments: jsonb('segments').notNull().default([]),
  /** pending | processing | completed | failed */
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
