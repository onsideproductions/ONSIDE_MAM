import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as usersSchema from './schema/users.js';
import * as assetsSchema from './schema/assets.js';
import * as collectionsSchema from './schema/collections.js';
import * as auditSchema from './schema/audit.js';
import * as aiAnalysisSchema from './schema/ai-analysis.js';
import * as settingsSchema from './schema/settings.js';
import * as sharesSchema from './schema/shares.js';
import * as commentsSchema from './schema/comments.js';

const schema = {
  ...usersSchema,
  ...assetsSchema,
  ...collectionsSchema,
  ...auditSchema,
  ...aiAnalysisSchema,
  ...settingsSchema,
  ...sharesSchema,
  ...commentsSchema,
};

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db) {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });
    _db = drizzle(pool, { schema });
  }
  return _db;
}

export { schema };
export { user, users, session, account, verification } from './schema/users.js';
export { assets, tags, assetTags } from './schema/assets.js';
export { collections, collectionAssets } from './schema/collections.js';
export { auditLog } from './schema/audit.js';
export { aiAnalysis } from './schema/ai-analysis.js';
export { notificationPreferences, accountSettings } from './schema/settings.js';
export { shares } from './schema/shares.js';
export { comments, commentMentions } from './schema/comments.js';
