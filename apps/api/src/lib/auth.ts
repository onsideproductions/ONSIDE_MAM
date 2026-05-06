import { betterAuth } from 'better-auth';
import pg from 'pg';
import { env } from './config.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _auth: any = null;

/**
 * If this is the very first user in the system, promote them to admin
 * automatically. This avoids the SSH bootstrap step on a fresh install.
 */
async function promoteIfFirstUser(pool: pg.Pool, userId: string): Promise<void> {
  // Count users (excluding the one we just created) - if zero, this is the first
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM "user" WHERE id != $1`,
    [userId]
  );
  const isFirst = (rows[0]?.n ?? 0) === 0;
  if (isFirst) {
    await pool.query(`UPDATE "user" SET role = 'admin' WHERE id = $1`, [userId]);
  }
}

export function getAuth() {
  if (!_auth) {
    const config = env();
    const pool = new pg.Pool({
      connectionString: config.DATABASE_URL,
    });

    // Allow extra origins via comma-separated env var (e.g. "http://1.2.3.4,https://mydomain.com")
    const extraOrigins = (process.env.TRUSTED_ORIGINS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    const trusted = Array.from(new Set([config.AUTH_URL, ...extraOrigins]));

    _auth = betterAuth({
      database: pool,
      secret: config.AUTH_SECRET,
      baseURL: config.AUTH_URL,
      trustedOrigins: trusted,
      emailAndPassword: {
        enabled: true,
        // For an internal team tool, no email verification step
        requireEmailVerification: false,
        // Allow registration; we'll lock it down once the org is set up
        autoSignIn: true,
      },
      session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // refresh once per day
      },
      user: {
        additionalFields: {
          role: {
            type: 'string',
            required: false,
            defaultValue: 'viewer',
            input: false, // role is not user-settable on signup
          },
        },
      },
      advanced: {
        cookiePrefix: 'onside-mam',
      },
      databaseHooks: {
        user: {
          create: {
            after: async (user: { id: string }) => {
              try {
                await promoteIfFirstUser(pool, user.id);
              } catch (err) {
                // Don't block signup if the promotion check fails
                console.error('First-user promotion check failed:', err);
              }
            },
          },
        },
      },
    });
  }
  return _auth;
}
