import { pgTable, text, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { assets } from './assets.js';

export const aiAnalysis = pgTable(
  'ai_analysis',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' })
      .unique(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    sceneDescriptions: jsonb('scene_descriptions'),
    detectedTags: text('detected_tags').array(),
    detectedObjects: text('detected_objects').array(),
    detectedText: text('detected_text').array(),
    summary: text('summary'),
    rawResponse: jsonb('raw_response'),
    modelUsed: varchar('model_used', { length: 50 }),
    analyzedAt: timestamp('analyzed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('ai_analysis_asset_idx').on(table.assetId),
    index('ai_analysis_status_idx').on(table.status),
  ]
);
