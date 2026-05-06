import { betterAuth } from 'better-auth';
import pg from 'pg';
import { env } from './config.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _auth: any = null;

export function getAuth() {
  if (!_auth) {
    const config = env();
    const pool = new pg.Pool({
      connectionString: config.DATABASE_URL,
    });

    _auth = betterAuth({
      database: pool,
      secret: config.AUTH_SECRET,
      baseURL: config.AUTH_URL,
      // Trust requests from the configured web origin
      trustedOrigins: [config.AUTH_URL],
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
    });
  }
  return _auth;
}
