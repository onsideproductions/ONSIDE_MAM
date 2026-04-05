import {
  pgTable,
  text,
  varchar,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { users } from './users';
import { assets } from './assets';

export const collections = pgTable(
  'collections',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    parentId: text('parent_id'),
    coverAssetId: text('cover_asset_id').references(() => assets.id, {
      onDelete: 'set null',
    }),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('collections_parent_idx').on(table.parentId),
    index('collections_created_by_idx').on(table.createdBy),
  ]
);

// Self-referential FK added after table definition
// collections.parentId references collections.id

export const collectionAssets = pgTable(
  'collection_assets',
  {
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('collection_assets_collection_idx').on(table.collectionId),
    index('collection_assets_asset_idx').on(table.assetId),
  ]
);
