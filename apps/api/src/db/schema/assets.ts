import {
  pgTable,
  text,
  varchar,
  integer,
  real,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { users } from './users.js';

export const assets = pgTable(
  'assets',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    title: varchar('title', { length: 500 }).notNull(),
    description: text('description'),
    originalFilename: varchar('original_filename', { length: 500 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: integer('file_size').notNull().default(0),
    duration: real('duration'),
    width: integer('width'),
    height: integer('height'),
    framerate: real('framerate'),
    codec: varchar('codec', { length: 50 }),
    status: varchar('status', { length: 20 }).notNull().default('uploading'),
    storageKey: text('storage_key').notNull(),
    proxyKey: text('proxy_key'),
    hlsKey: text('hls_key'),
    thumbnailKey: text('thumbnail_key'),
    spriteKey: text('sprite_key'),
    metadata: jsonb('metadata').default({}),
    createdBy: text('created_by')
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    searchVector: text('search_vector'),
  },
  (table) => [
    index('assets_status_idx').on(table.status),
    index('assets_created_by_idx').on(table.createdBy),
    index('assets_created_at_idx').on(table.createdAt),
  ]
);

export const tags = pgTable('tags', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: varchar('name', { length: 100 }).notNull().unique(),
  color: varchar('color', { length: 7 }),
  createdBy: text('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assetTags = pgTable(
  'asset_tags',
  {
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('asset_tags_asset_idx').on(table.assetId),
    index('asset_tags_tag_idx').on(table.tagId),
  ]
);
