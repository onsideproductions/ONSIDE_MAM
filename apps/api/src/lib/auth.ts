import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import pg from 'pg';
import { env } from './config.js';

let _auth: ReturnType<typeof betterAuth> | null = null;

export function getAuth() {
  if (!_auth) {
    const config = env();
    const pool = new pg.Pool({
      connectionString: config.DATABASE_URL,
    });

    _auth = betterAuth({
      database: drizzleAdapter(pool, { provider: 'pg' }),
      secret: config.AUTH_SECRET,
      baseURL: config.AUTH_URL,
      emailAndPassword: {
        enabled: true,
      },
      session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // 1 day
      },
      user: {
        additionalFields: {
          role: {
            type: 'string',
            required: false,
            defaultValue: 'viewer',
          },
        },
      },
    });
  }
  return _auth;
}
