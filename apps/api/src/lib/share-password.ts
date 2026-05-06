import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt);

/**
 * Hash a share password with scrypt.
 * Format: "scrypt$<saltHex>$<hashHex>"
 */
export async function hashSharePassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scrypt(password, salt, 32)) as Buffer;
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifySharePassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
