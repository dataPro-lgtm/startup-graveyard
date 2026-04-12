import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { UserProfile } from '@sg/shared/schemas/auth';
import {
  type BillingInterval,
  type BillingStatus,
  type SubscriptionTier,
  resolveEntitlements,
} from '@sg/shared/billing';
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

export type UserBillingAccount = UserProfile & {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export type UpdateBillingAccountInput = {
  subscription?: SubscriptionTier;
  billingStatus?: BillingStatus;
  billingInterval?: BillingInterval | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  currentPeriodEnd?: string | Date | null;
  cancelAtPeriodEnd?: boolean;
};

export interface UsersRepository {
  register(email: string, password: string, displayName?: string): Promise<RegisterResult>;
  login(email: string, password: string): Promise<LoginResult>;
  refresh(token: string): Promise<RefreshResult>;
  logout(userId: string): Promise<void>;
  getById(id: string): Promise<UserProfile | null>;
  getBillingAccount(userId: string): Promise<UserBillingAccount | null>;
  getBillingAccountByStripeCustomerId(customerId: string): Promise<UserBillingAccount | null>;
  updateBillingAccount(userId: string, patch: UpdateBillingAccountInput): Promise<boolean>;
  setSubscription(userId: string, tier: SubscriptionTier): Promise<boolean>;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  subscription: SubscriptionTier;
  billing_status: BillingStatus;
  billing_interval: BillingInterval | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  role: 'user' | 'admin';
  created_at: string;
}

type MockUserRecord = UserBillingAccount & {
  passwordHash: string;
};

const SALT_ROUNDS = 12;
const USER_SELECT_COLUMNS = `
  id,
  email,
  password_hash,
  display_name,
  subscription,
  billing_status,
  billing_interval,
  stripe_customer_id,
  stripe_subscription_id,
  current_period_end,
  cancel_at_period_end,
  role,
  created_at
`;

function toIsoString(value: string | Date | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function rowToProfile(row: UserRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    subscription: row.subscription,
    billingStatus: row.billing_status,
    effectiveSubscription: row.subscription,
    effectiveBillingStatus: row.billing_status,
    billingInterval: row.billing_interval,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    entitlements: resolveEntitlements({
      subscription: row.subscription,
      billingStatus: row.billing_status,
    }),
    workspaceAccess: {
      source: 'personal',
      workspaceId: null,
      workspaceName: null,
      workspaceRole: null,
      inheritedFromUserId: null,
      inheritedFromName: null,
      effectiveSubscription: row.subscription,
      effectiveBillingStatus: row.billing_status,
      warningCodes: [],
    },
    role: row.role,
    createdAt: row.created_at,
  };
}

function rowToBillingAccount(row: UserRow): UserBillingAccount {
  return {
    ...rowToProfile(row),
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
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

function createMockUserRecord(input: {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  role?: 'user' | 'admin';
  subscription?: SubscriptionTier;
  billingStatus?: BillingStatus;
  billingInterval?: BillingInterval | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  createdAt?: string;
}): MockUserRecord {
  const subscription = input.subscription ?? 'free';
  const billingStatus = input.billingStatus ?? 'inactive';
  const billingInterval = input.billingInterval ?? null;
  const currentPeriodEnd = input.currentPeriodEnd ?? null;
  const cancelAtPeriodEnd = input.cancelAtPeriodEnd ?? false;
  const createdAt = input.createdAt ?? new Date().toISOString();

  const row: UserRow = {
    id: input.id,
    email: input.email,
    password_hash: input.passwordHash,
    display_name: input.displayName,
    subscription,
    billing_status: billingStatus,
    billing_interval: billingInterval,
    stripe_customer_id: input.stripeCustomerId ?? null,
    stripe_subscription_id: input.stripeSubscriptionId ?? null,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: cancelAtPeriodEnd,
    role: input.role ?? 'user',
    created_at: createdAt,
  };

  return {
    ...rowToBillingAccount(row),
    passwordHash: input.passwordHash,
  };
}

export class MockUsersRepository implements UsersRepository {
  private readonly users = new Map<string, MockUserRecord>();
  private readonly userIdByEmail = new Map<string, string>();
  private readonly refreshSessions = new Map<string, { userId: string; expiresAt: string }>();

  constructor() {
    const adminId = randomUUID();
    const admin = createMockUserRecord({
      id: adminId,
      email: 'admin@startupgraveyard.local',
      displayName: 'SG Admin',
      role: 'admin',
      passwordHash: bcrypt.hashSync('password123', SALT_ROUNDS),
    });
    this.users.set(adminId, admin);
    this.userIdByEmail.set(admin.email, adminId);
  }

  async register(email: string, password: string, displayName?: string): Promise<RegisterResult> {
    const normalized = email.trim().toLowerCase();
    if (this.userIdByEmail.has(normalized)) {
      return { ok: false, code: 'email_taken' };
    }

    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = createMockUserRecord({
      id,
      email: normalized,
      displayName: displayName ?? null,
      passwordHash,
    });
    this.users.set(id, user);
    this.userIdByEmail.set(normalized, id);

    const result = buildAuthResult(this.toUserProfile(user));
    this.refreshSessions.set(result.refreshToken, {
      userId: user.id,
      expiresAt: refreshTokenExpiresAt().toISOString(),
    });
    return result;
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const normalized = email.trim().toLowerCase();
    const userId = this.userIdByEmail.get(normalized);
    if (!userId) return { ok: false, code: 'invalid_credentials' };
    const user = this.users.get(userId);
    if (!user) return { ok: false, code: 'invalid_credentials' };

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return { ok: false, code: 'invalid_credentials' };

    for (const [token, session] of this.refreshSessions.entries()) {
      if (session.userId === user.id) this.refreshSessions.delete(token);
    }

    const result = buildAuthResult(this.toUserProfile(user));
    this.refreshSessions.set(result.refreshToken, {
      userId: user.id,
      expiresAt: refreshTokenExpiresAt().toISOString(),
    });
    return result;
  }

  async refresh(token: string): Promise<RefreshResult> {
    const session = this.refreshSessions.get(token);
    if (!session) return { ok: false, code: 'not_found' };
    if (new Date(session.expiresAt) < new Date()) {
      this.refreshSessions.delete(token);
      return { ok: false, code: 'token_expired' };
    }

    const user = this.users.get(session.userId);
    if (!user) return { ok: false, code: 'not_found' };

    this.refreshSessions.delete(token);
    const result = buildAuthResult(this.toUserProfile(user));
    this.refreshSessions.set(result.refreshToken, {
      userId: user.id,
      expiresAt: refreshTokenExpiresAt().toISOString(),
    });
    return result;
  }

  async logout(userId: string): Promise<void> {
    for (const [token, session] of this.refreshSessions.entries()) {
      if (session.userId === userId) this.refreshSessions.delete(token);
    }
  }

  async getById(id: string): Promise<UserProfile | null> {
    const user = this.users.get(id);
    return user ? this.toUserProfile(user) : null;
  }

  async getBillingAccount(userId: string): Promise<UserBillingAccount | null> {
    return this.users.get(userId) ?? null;
  }

  async getBillingAccountByStripeCustomerId(
    customerId: string,
  ): Promise<UserBillingAccount | null> {
    for (const user of this.users.values()) {
      if (user.stripeCustomerId === customerId) return user;
    }
    return null;
  }

  async updateBillingAccount(userId: string, patch: UpdateBillingAccountInput): Promise<boolean> {
    const current = this.users.get(userId);
    if (!current) return false;
    const next = createMockUserRecord({
      id: current.id,
      email: current.email,
      displayName: current.displayName,
      passwordHash: current.passwordHash,
      role: current.role,
      subscription: patch.subscription ?? current.subscription,
      billingStatus: patch.billingStatus ?? current.billingStatus,
      billingInterval:
        patch.billingInterval !== undefined ? patch.billingInterval : current.billingInterval,
      stripeCustomerId:
        patch.stripeCustomerId !== undefined ? patch.stripeCustomerId : current.stripeCustomerId,
      stripeSubscriptionId:
        patch.stripeSubscriptionId !== undefined
          ? patch.stripeSubscriptionId
          : current.stripeSubscriptionId,
      currentPeriodEnd:
        patch.currentPeriodEnd !== undefined
          ? (toIsoString(patch.currentPeriodEnd) ?? null)
          : current.currentPeriodEnd,
      cancelAtPeriodEnd:
        patch.cancelAtPeriodEnd !== undefined ? patch.cancelAtPeriodEnd : current.cancelAtPeriodEnd,
      createdAt: current.createdAt,
    });
    this.users.set(userId, next);
    return true;
  }

  async setSubscription(userId: string, tier: SubscriptionTier): Promise<boolean> {
    return this.updateBillingAccount(userId, {
      subscription: tier,
      billingStatus: tier === 'free' ? 'inactive' : 'active',
      billingInterval: tier === 'free' ? null : 'month',
      cancelAtPeriodEnd: false,
    });
  }

  private toUserProfile(user: MockUserRecord): UserProfile {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      subscription: user.subscription,
      billingStatus: user.billingStatus,
      effectiveSubscription: user.subscription,
      effectiveBillingStatus: user.billingStatus,
      billingInterval: user.billingInterval,
      currentPeriodEnd: user.currentPeriodEnd,
      cancelAtPeriodEnd: user.cancelAtPeriodEnd,
      entitlements: resolveEntitlements({
        subscription: user.subscription,
        billingStatus: user.billingStatus,
      }),
      workspaceAccess: {
        source: 'personal',
        workspaceId: null,
        workspaceName: null,
        workspaceRole: null,
        inheritedFromUserId: null,
        inheritedFromName: null,
        effectiveSubscription: user.subscription,
        effectiveBillingStatus: user.billingStatus,
        warningCodes: [],
      },
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}

export class PgUsersRepository implements UsersRepository {
  constructor(private readonly pool: Pool) {}

  async register(email: string, password: string, displayName?: string): Promise<RegisterResult> {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if ((existing.rowCount ?? 0) > 0) {
        await client.query('ROLLBACK');
        return { ok: false, code: 'email_taken' };
      }

      const { rows } = await client.query<UserRow>(
        `INSERT INTO users (email, password_hash, display_name)
         VALUES ($1, $2, $3)
         RETURNING ${USER_SELECT_COLUMNS}`,
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
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT ${USER_SELECT_COLUMNS}
       FROM users WHERE email = $1`,
      [email],
    );
    if (rows.length === 0) return { ok: false, code: 'invalid_credentials' };

    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) return { ok: false, code: 'invalid_credentials' };

    const user = rowToProfile(rows[0]);
    const result = buildAuthResult(user);

    await this.pool.query(
      `INSERT INTO user_sessions (user_id, refresh_token, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET refresh_token = EXCLUDED.refresh_token,
             expires_at = EXCLUDED.expires_at,
             created_at = NOW()`,
      [user.id, result.refreshToken, refreshTokenExpiresAt()],
    );

    return result;
  }

  async refresh(token: string): Promise<RefreshResult> {
    const { rows } = await this.pool.query<{ user_id: string; expires_at: string }>(
      `SELECT user_id, expires_at FROM user_sessions WHERE refresh_token = $1`,
      [token],
    );
    if (rows.length === 0) return { ok: false, code: 'not_found' };
    if (new Date(rows[0].expires_at) < new Date()) return { ok: false, code: 'token_expired' };

    const { rows: userRows } = await this.pool.query<UserRow>(
      `SELECT ${USER_SELECT_COLUMNS} FROM users WHERE id = $1`,
      [rows[0].user_id],
    );
    if (userRows.length === 0) return { ok: false, code: 'not_found' };

    const user = rowToProfile(userRows[0]);
    const result = buildAuthResult(user);
    await this.pool.query(
      `UPDATE user_sessions
       SET refresh_token = $1, expires_at = $2, created_at = NOW()
       WHERE user_id = $3`,
      [result.refreshToken, refreshTokenExpiresAt(), user.id],
    );

    return result;
  }

  async logout(userId: string): Promise<void> {
    await this.pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
  }

  async getById(id: string): Promise<UserProfile | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT ${USER_SELECT_COLUMNS} FROM users WHERE id = $1`,
      [id],
    );
    return rows.length > 0 ? rowToProfile(rows[0]) : null;
  }

  async getBillingAccount(userId: string): Promise<UserBillingAccount | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT ${USER_SELECT_COLUMNS} FROM users WHERE id = $1`,
      [userId],
    );
    return rows.length > 0 ? rowToBillingAccount(rows[0]) : null;
  }

  async getBillingAccountByStripeCustomerId(
    customerId: string,
  ): Promise<UserBillingAccount | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT ${USER_SELECT_COLUMNS}
       FROM users
       WHERE stripe_customer_id = $1`,
      [customerId],
    );
    return rows.length > 0 ? rowToBillingAccount(rows[0]) : null;
  }

  async updateBillingAccount(userId: string, patch: UpdateBillingAccountInput): Promise<boolean> {
    const sets: string[] = [];
    const values: unknown[] = [];

    const push = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (patch.subscription !== undefined) push('subscription', patch.subscription);
    if (patch.billingStatus !== undefined) push('billing_status', patch.billingStatus);
    if (patch.billingInterval !== undefined) push('billing_interval', patch.billingInterval);
    if (patch.stripeCustomerId !== undefined) push('stripe_customer_id', patch.stripeCustomerId);
    if (patch.stripeSubscriptionId !== undefined) {
      push('stripe_subscription_id', patch.stripeSubscriptionId);
    }
    if (patch.currentPeriodEnd !== undefined) {
      push('current_period_end', toIsoString(patch.currentPeriodEnd) ?? null);
    }
    if (patch.cancelAtPeriodEnd !== undefined) {
      push('cancel_at_period_end', patch.cancelAtPeriodEnd);
    }

    if (sets.length === 0) return false;

    sets.push('updated_at = NOW()');
    values.push(userId);
    const { rowCount } = await this.pool.query(
      `UPDATE users
       SET ${sets.join(', ')}
       WHERE id = $${values.length}`,
      values,
    );
    return (rowCount ?? 0) > 0;
  }

  async setSubscription(userId: string, tier: SubscriptionTier): Promise<boolean> {
    return this.updateBillingAccount(userId, {
      subscription: tier,
      billingStatus: tier === 'free' ? 'inactive' : 'active',
      billingInterval: tier === 'free' ? null : 'month',
      cancelAtPeriodEnd: false,
    });
  }
}
