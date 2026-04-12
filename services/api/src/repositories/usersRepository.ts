import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import type { UserProfile } from '@sg/shared/schemas/auth';
import {
  generateRefreshToken,
  refreshTokenExpiresAt,
  signAccessToken,
  ACCESS_TOKEN_TTL_SECONDS,
} from '../auth/tokens.js';

export interface AuthResult {
  ok: true;
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
export interface AuthError {
  ok: false;
  code: 'email_taken' | 'invalid_credentials' | 'token_expired' | 'not_found';
}

export type RegisterResult = AuthResult | AuthError;
export type LoginResult = AuthResult | AuthError;
export type RefreshResult = AuthResult | AuthError;

// ── Row types ──────────────────────────────────────────────────────────────
interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  subscription: 'free' | 'pro';
  role: 'user' | 'admin';
  created_at: string;
}

const SALT_ROUNDS = 12;

function rowToProfile(r: UserRow): UserProfile {
  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    subscription: r.subscription,
    role: r.role,
    createdAt: r.created_at,
  };
}

function buildAuthResult(user: UserProfile): AuthResult {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    subscription: user.subscription,
  });
  const refreshToken = generateRefreshToken();
  return { ok: true, user, accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export class PgUsersRepository {
  constructor(private readonly pool: Pool) {}

  // ── Register ──────────────────────────────────────────────────────────────
  async register(email: string, password: string, displayName?: string): Promise<RegisterResult> {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Check duplicate
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rowCount && existing.rowCount > 0) {
        await client.query('ROLLBACK');
        return { ok: false, code: 'email_taken' };
      }

      const { rows } = await client.query<UserRow>(
        `INSERT INTO users (email, password_hash, display_name)
         VALUES ($1, $2, $3)
         RETURNING id, email, password_hash, display_name, subscription, role, created_at`,
        [email, hash, displayName ?? null],
      );
      const user = rowToProfile(rows[0]);
      const result = buildAuthResult(user);

      await client.query(
        `INSERT INTO user_sessions (user_id, refresh_token, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, result.refreshToken, refreshTokenExpiresAt()],
      );

      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  async login(email: string, password: string): Promise<LoginResult> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, display_name, subscription, role, created_at
       FROM users WHERE email = $1`,
      [email],
    );
    if (rows.length === 0) return { ok: false, code: 'invalid_credentials' };

    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) return { ok: false, code: 'invalid_credentials' };

    const user = rowToProfile(rows[0]);
    const result = buildAuthResult(user);

    // Upsert session (replace previous refresh token)
    await this.pool.query(
      `INSERT INTO user_sessions (user_id, refresh_token, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET refresh_token = EXCLUDED.refresh_token,
             expires_at    = EXCLUDED.expires_at,
             created_at    = NOW()`,
      [user.id, result.refreshToken, refreshTokenExpiresAt()],
    );

    return result;
  }

  // ── Refresh ───────────────────────────────────────────────────────────────
  async refresh(token: string): Promise<RefreshResult> {
    const { rows } = await this.pool.query<{
      user_id: string;
      expires_at: string;
    }>(
      `SELECT user_id, expires_at FROM user_sessions
       WHERE refresh_token = $1`,
      [token],
    );
    if (rows.length === 0) return { ok: false, code: 'not_found' };
    if (new Date(rows[0].expires_at) < new Date()) return { ok: false, code: 'token_expired' };

    const { rows: userRows } = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, display_name, subscription, role, created_at
       FROM users WHERE id = $1`,
      [rows[0].user_id],
    );
    if (userRows.length === 0) return { ok: false, code: 'not_found' };

    const user = rowToProfile(userRows[0]);
    const result = buildAuthResult(user);

    // Rotate refresh token
    await this.pool.query(
      `UPDATE user_sessions
       SET refresh_token = $1, expires_at = $2, created_at = NOW()
       WHERE user_id = $3`,
      [result.refreshToken, refreshTokenExpiresAt(), user.id],
    );

    return result;
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  async logout(userId: string): Promise<void> {
    await this.pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
  }

  // ── Get by ID ─────────────────────────────────────────────────────────────
  async getById(id: string): Promise<UserProfile | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, display_name, subscription, role, created_at
       FROM users WHERE id = $1`,
      [id],
    );
    return rows.length > 0 ? rowToProfile(rows[0]) : null;
  }

  // ── Admin: upgrade subscription ───────────────────────────────────────────
  async setSubscription(userId: string, tier: 'free' | 'pro'): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE users SET subscription = $1, updated_at = NOW() WHERE id = $2`,
      [tier, userId],
    );
    return (rowCount ?? 0) > 0;
  }
}
