import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AdminRole, UserProfile } from '@sg/shared/schemas/auth';
import {
  type BillingInterval,
  type BillingStatus,
  type SubscriptionTier,
  resolveEntitlements,
} from '@sg/shared/billing';
import type { SubscriptionAdminMetrics } from '@sg/shared/schemas/adminStats';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiresAt,
  signAccessToken,
  ACCESS_TOKEN_TTL_SECONDS,
} from '../auth/tokens.js';

export interface AuthResult {
  ok: true;
  user: UserProfile;
  sessionId: string;
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

export type SessionContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type UserSessionRecord = {
  id: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

export type UserBillingAccount = UserProfile & {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export type PasswordResetTokenResult =
  | {
      ok: true;
      userId: string;
      email: string;
      displayName: string | null;
      token: string;
      expiresAt: string;
    }
  | { ok: false; code: 'not_found' };

export type PasswordResetResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; code: 'invalid_or_expired_token' };

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
  register(
    email: string,
    password: string,
    displayName?: string,
    sessionContext?: SessionContext,
  ): Promise<RegisterResult>;
  login(email: string, password: string, sessionContext?: SessionContext): Promise<LoginResult>;
  refresh(token: string, sessionContext?: SessionContext): Promise<RefreshResult>;
  logout(userId: string, sessionId?: string): Promise<void>;
  logoutByRefreshToken(token: string): Promise<void>;
  isSessionActive(userId: string, sessionId: string): Promise<boolean>;
  listSessions(userId: string): Promise<UserSessionRecord[]>;
  revokeSession(userId: string, sessionId: string): Promise<boolean>;
  revokeOtherSessions(userId: string, currentSessionId: string): Promise<number>;
  createPasswordResetToken(email: string, ttlMinutes: number): Promise<PasswordResetTokenResult>;
  resetPasswordWithToken(token: string, newPassword: string): Promise<PasswordResetResult>;
  getById(id: string): Promise<UserProfile | null>;
  setAdminRole(userId: string, adminRole: AdminRole | null): Promise<boolean>;
  getBillingAccount(userId: string): Promise<UserBillingAccount | null>;
  getBillingAccountByStripeCustomerId(customerId: string): Promise<UserBillingAccount | null>;
  getAdminMetrics(): Promise<SubscriptionAdminMetrics>;
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
  admin_role: AdminRole | null;
  created_at: string;
}

type MockUserRecord = UserBillingAccount & {
  passwordHash: string;
};

const SALT_ROUNDS = 12;
const MAX_ACTIVE_SESSIONS = 10;
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
  admin_role,
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
    adminRole: row.admin_role,
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

function buildAuthResult(user: UserProfile, sessionId: string): AuthResult {
  const accessToken = signAccessToken({
    sub: user.id,
    sid: sessionId,
    email: user.email,
    role: user.role,
    subscription: user.subscription,
  });
  const refreshToken = generateRefreshToken();
  return {
    ok: true,
    user,
    sessionId,
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

function createMockUserRecord(input: {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  role?: 'user' | 'admin';
  adminRole?: AdminRole | null;
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
    admin_role: input.adminRole ?? (input.role === 'admin' ? 'owner' : null),
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
  private readonly refreshSessions = new Map<
    string,
    UserSessionRecord & { refreshTokenHash: string }
  >();
  private readonly passwordResetTokens = new Map<
    string,
    { userId: string; expiresAt: string; usedAt: string | null }
  >();

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

  async register(
    email: string,
    password: string,
    displayName?: string,
    sessionContext?: SessionContext,
  ): Promise<RegisterResult> {
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

    return this.createSession(this.toUserProfile(user), sessionContext);
  }

  async login(
    email: string,
    password: string,
    sessionContext?: SessionContext,
  ): Promise<LoginResult> {
    const normalized = email.trim().toLowerCase();
    const userId = this.userIdByEmail.get(normalized);
    if (!userId) return { ok: false, code: 'invalid_credentials' };
    const user = this.users.get(userId);
    if (!user) return { ok: false, code: 'invalid_credentials' };

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return { ok: false, code: 'invalid_credentials' };

    return this.createSession(this.toUserProfile(user), sessionContext);
  }

  async refresh(token: string, sessionContext?: SessionContext): Promise<RefreshResult> {
    const tokenHash = hashRefreshToken(token);
    const session = this.refreshSessions.get(tokenHash);
    if (!session) return { ok: false, code: 'not_found' };
    if (new Date(session.expiresAt) < new Date()) {
      this.refreshSessions.delete(tokenHash);
      return { ok: false, code: 'token_expired' };
    }

    const user = this.users.get(session.userId);
    if (!user) return { ok: false, code: 'not_found' };

    this.refreshSessions.delete(tokenHash);
    const result = buildAuthResult(this.toUserProfile(user), session.id);
    const now = new Date().toISOString();
    const nextHash = hashRefreshToken(result.refreshToken);
    this.refreshSessions.set(nextHash, {
      ...session,
      refreshTokenHash: nextHash,
      ipAddress: sessionContext?.ipAddress ?? session.ipAddress,
      userAgent: sessionContext?.userAgent ?? session.userAgent,
      lastSeenAt: now,
      expiresAt: refreshTokenExpiresAt().toISOString(),
    });
    return result;
  }

  async logout(userId: string, sessionId?: string): Promise<void> {
    for (const [tokenHash, session] of this.refreshSessions.entries()) {
      if (session.userId === userId && (!sessionId || session.id === sessionId)) {
        this.refreshSessions.delete(tokenHash);
      }
    }
  }

  async logoutByRefreshToken(token: string): Promise<void> {
    this.refreshSessions.delete(hashRefreshToken(token));
  }

  async isSessionActive(userId: string, sessionId: string): Promise<boolean> {
    return [...this.refreshSessions.values()].some(
      (session) =>
        session.userId === userId &&
        session.id === sessionId &&
        new Date(session.expiresAt) > new Date(),
    );
  }

  async listSessions(userId: string): Promise<UserSessionRecord[]> {
    return [...this.refreshSessions.values()]
      .filter((session) => session.userId === userId && new Date(session.expiresAt) > new Date())
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
      .map(({ refreshTokenHash: _refreshTokenHash, ...session }) => session);
  }

  async revokeSession(userId: string, sessionId: string): Promise<boolean> {
    for (const [tokenHash, session] of this.refreshSessions.entries()) {
      if (session.userId === userId && session.id === sessionId) {
        this.refreshSessions.delete(tokenHash);
        return true;
      }
    }
    return false;
  }

  async revokeOtherSessions(userId: string, currentSessionId: string): Promise<number> {
    let revokedCount = 0;
    for (const [tokenHash, session] of this.refreshSessions.entries()) {
      if (session.userId === userId && session.id !== currentSessionId) {
        this.refreshSessions.delete(tokenHash);
        revokedCount += 1;
      }
    }
    return revokedCount;
  }

  async createPasswordResetToken(
    email: string,
    ttlMinutes: number,
  ): Promise<PasswordResetTokenResult> {
    const normalized = email.trim().toLowerCase();
    const userId = this.userIdByEmail.get(normalized);
    const user = userId ? this.users.get(userId) : undefined;
    if (!userId || !user) return { ok: false, code: 'not_found' };

    for (const [tokenHash, record] of this.passwordResetTokens.entries()) {
      if (record.userId === userId && record.usedAt == null) {
        this.passwordResetTokens.delete(tokenHash);
      }
    }

    const token = generateRefreshToken();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
    this.passwordResetTokens.set(hashRefreshToken(token), {
      userId,
      expiresAt,
      usedAt: null,
    });
    return {
      ok: true,
      userId,
      email: user.email,
      displayName: user.displayName,
      token,
      expiresAt,
    };
  }

  async resetPasswordWithToken(token: string, newPassword: string): Promise<PasswordResetResult> {
    const tokenHash = hashRefreshToken(token);
    const record = this.passwordResetTokens.get(tokenHash);
    if (!record || record.usedAt != null || new Date(record.expiresAt) <= new Date()) {
      return { ok: false, code: 'invalid_or_expired_token' };
    }
    const user = this.users.get(record.userId);
    if (!user) return { ok: false, code: 'invalid_or_expired_token' };

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    this.users.set(user.id, { ...user, passwordHash });
    this.passwordResetTokens.set(tokenHash, { ...record, usedAt: new Date().toISOString() });
    // A credential reset invalidates every device session for the account.
    await this.logout(user.id);
    return { ok: true, userId: user.id, email: user.email };
  }

  async getById(id: string): Promise<UserProfile | null> {
    const user = this.users.get(id);
    return user ? this.toUserProfile(user) : null;
  }

  async setAdminRole(userId: string, adminRole: AdminRole | null): Promise<boolean> {
    const current = this.users.get(userId);
    if (!current) return false;
    const next = createMockUserRecord({
      id: current.id,
      email: current.email,
      displayName: current.displayName,
      passwordHash: current.passwordHash,
      role: adminRole ? 'admin' : 'user',
      adminRole,
      subscription: current.subscription,
      billingStatus: current.billingStatus,
      billingInterval: current.billingInterval,
      stripeCustomerId: current.stripeCustomerId,
      stripeSubscriptionId: current.stripeSubscriptionId,
      currentPeriodEnd: current.currentPeriodEnd,
      cancelAtPeriodEnd: current.cancelAtPeriodEnd,
      createdAt: current.createdAt,
    });
    this.users.set(userId, next);
    return true;
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

  async getAdminMetrics(): Promise<SubscriptionAdminMetrics> {
    const users = [...this.users.values()].filter((user) => user.role === 'user');
    const totalUsers = users.length;
    const freeUsers = users.filter((user) => user.subscription === 'free').length;
    const proUsers = users.filter((user) => user.subscription === 'pro').length;
    const teamUsers = users.filter((user) => user.subscription === 'team').length;
    const activePaidUsers = users.filter(
      (user) =>
        user.subscription !== 'free' &&
        (user.billingStatus === 'active' ||
          user.billingStatus === 'trialing' ||
          user.billingStatus === 'past_due'),
    ).length;
    const pastDueUsers = users.filter((user) => user.billingStatus === 'past_due').length;
    const cancelingUsers = users.filter(
      (user) => user.subscription !== 'free' && user.cancelAtPeriodEnd,
    ).length;

    return {
      totalUsers,
      freeUsers,
      proUsers,
      teamUsers,
      activePaidUsers,
      pastDueUsers,
      cancelingUsers,
      paidConversionRate: totalUsers > 0 ? activePaidUsers / totalUsers : null,
      teamMixRate: activePaidUsers > 0 ? teamUsers / activePaidUsers : null,
    };
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
      adminRole: current.adminRole,
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

  private createSession(user: UserProfile, context?: SessionContext): AuthResult {
    const sessionId = randomUUID();
    const result = buildAuthResult(user, sessionId);
    const now = new Date().toISOString();
    const refreshTokenHash = hashRefreshToken(result.refreshToken);
    this.refreshSessions.set(refreshTokenHash, {
      id: sessionId,
      userId: user.id,
      refreshTokenHash,
      ipAddress: context?.ipAddress ?? null,
      userAgent: context?.userAgent ?? null,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: refreshTokenExpiresAt().toISOString(),
    });

    const sessions = [...this.refreshSessions.entries()]
      .filter(([, session]) => session.userId === user.id)
      .sort(([, a], [, b]) => b.lastSeenAt.localeCompare(a.lastSeenAt));
    for (const [tokenHash] of sessions.slice(MAX_ACTIVE_SESSIONS)) {
      this.refreshSessions.delete(tokenHash);
    }
    return result;
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
      adminRole: user.adminRole,
      createdAt: user.createdAt,
    };
  }
}

export class PgUsersRepository implements UsersRepository {
  constructor(private readonly pool: Pool) {}

  async register(
    email: string,
    password: string,
    displayName?: string,
    sessionContext?: SessionContext,
  ): Promise<RegisterResult> {
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
      const sessionId = randomUUID();
      const result = buildAuthResult(user, sessionId);

      await client.query(
        `INSERT INTO user_sessions
           (id, user_id, refresh_token_hash, expires_at, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5::inet, $6)`,
        [
          sessionId,
          user.id,
          hashRefreshToken(result.refreshToken),
          refreshTokenExpiresAt(),
          sessionContext?.ipAddress ?? null,
          sessionContext?.userAgent ?? null,
        ],
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

  async login(
    email: string,
    password: string,
    sessionContext?: SessionContext,
  ): Promise<LoginResult> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT ${USER_SELECT_COLUMNS}
       FROM users WHERE email = $1`,
      [email],
    );
    if (rows.length === 0) return { ok: false, code: 'invalid_credentials' };

    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) return { ok: false, code: 'invalid_credentials' };

    const user = rowToProfile(rows[0]);
    const sessionId = randomUUID();
    const result = buildAuthResult(user, sessionId);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize concurrent logins for one account so the device cap remains strict.
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [user.id]);
      await client.query(
        `INSERT INTO user_sessions
           (id, user_id, refresh_token_hash, expires_at, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5::inet, $6)`,
        [
          sessionId,
          user.id,
          hashRefreshToken(result.refreshToken),
          refreshTokenExpiresAt(),
          sessionContext?.ipAddress ?? null,
          sessionContext?.userAgent ?? null,
        ],
      );
      await client.query(
        `DELETE FROM user_sessions
         WHERE id IN (
           SELECT id
           FROM user_sessions
           WHERE user_id = $1
           ORDER BY last_seen_at DESC, created_at DESC
           OFFSET $2
         )`,
        [user.id, MAX_ACTIVE_SESSIONS],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return result;
  }

  async refresh(token: string, sessionContext?: SessionContext): Promise<RefreshResult> {
    const tokenHash = hashRefreshToken(token);
    const { rows } = await this.pool.query<{
      id: string;
      user_id: string;
      expires_at: string;
    }>(
      `SELECT id, user_id, expires_at
       FROM user_sessions
       WHERE refresh_token_hash = $1`,
      [tokenHash],
    );
    if (rows.length === 0) return { ok: false, code: 'not_found' };
    if (new Date(rows[0].expires_at) < new Date()) {
      await this.pool.query('DELETE FROM user_sessions WHERE id = $1', [rows[0].id]);
      return { ok: false, code: 'token_expired' };
    }

    const { rows: userRows } = await this.pool.query<UserRow>(
      `SELECT ${USER_SELECT_COLUMNS} FROM users WHERE id = $1`,
      [rows[0].user_id],
    );
    if (userRows.length === 0) return { ok: false, code: 'not_found' };

    const user = rowToProfile(userRows[0]);
    const result = buildAuthResult(user, rows[0].id);
    const rotated = await this.pool.query(
      `UPDATE user_sessions
       SET refresh_token_hash = $1,
           expires_at = $2,
           last_seen_at = NOW(),
           ip_address = COALESCE($3::inet, ip_address),
           user_agent = COALESCE($4, user_agent)
       WHERE id = $5
         AND refresh_token_hash = $6`,
      [
        hashRefreshToken(result.refreshToken),
        refreshTokenExpiresAt(),
        sessionContext?.ipAddress ?? null,
        sessionContext?.userAgent ?? null,
        rows[0].id,
        tokenHash,
      ],
    );
    if ((rotated.rowCount ?? 0) === 0) return { ok: false, code: 'not_found' };

    return result;
  }

  async logout(userId: string, sessionId?: string): Promise<void> {
    if (sessionId) {
      await this.pool.query('DELETE FROM user_sessions WHERE user_id = $1 AND id = $2', [
        userId,
        sessionId,
      ]);
      return;
    }
    await this.pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
  }

  async logoutByRefreshToken(token: string): Promise<void> {
    await this.pool.query('DELETE FROM user_sessions WHERE refresh_token_hash = $1', [
      hashRefreshToken(token),
    ]);
  }

  async isSessionActive(userId: string, sessionId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `SELECT 1
       FROM user_sessions
       WHERE user_id = $1
         AND id = $2
         AND expires_at > NOW()
       LIMIT 1`,
      [userId, sessionId],
    );
    return (rowCount ?? 0) > 0;
  }

  async listSessions(userId: string): Promise<UserSessionRecord[]> {
    const { rows } = await this.pool.query<{
      id: string;
      user_id: string;
      ip_address: string | null;
      user_agent: string | null;
      created_at: Date | string;
      last_seen_at: Date | string;
      expires_at: Date | string;
    }>(
      `SELECT id, user_id, host(ip_address) AS ip_address, user_agent,
              created_at, last_seen_at, expires_at
       FROM user_sessions
       WHERE user_id = $1
         AND expires_at > NOW()
       ORDER BY last_seen_at DESC, created_at DESC`,
      [userId],
    );
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: toIsoString(row.created_at)!,
      lastSeenAt: toIsoString(row.last_seen_at)!,
      expiresAt: toIsoString(row.expires_at)!,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'DELETE FROM user_sessions WHERE user_id = $1 AND id = $2',
      [userId, sessionId],
    );
    return (rowCount ?? 0) > 0;
  }

  async revokeOtherSessions(userId: string, currentSessionId: string): Promise<number> {
    const { rowCount } = await this.pool.query(
      'DELETE FROM user_sessions WHERE user_id = $1 AND id <> $2',
      [userId, currentSessionId],
    );
    return rowCount ?? 0;
  }

  async createPasswordResetToken(
    email: string,
    ttlMinutes: number,
  ): Promise<PasswordResetTokenResult> {
    const { rows } = await this.pool.query<{
      id: string;
      email: string;
      display_name: string | null;
    }>(`SELECT id, email, display_name FROM users WHERE email = $1`, [email]);
    if (rows.length === 0) return { ok: false, code: 'not_found' };

    const token = generateRefreshToken();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL`,
        [rows[0].id],
      );
      await client.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [rows[0].id, hashRefreshToken(token), expiresAt],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      ok: true,
      userId: rows[0].id,
      email: rows[0].email,
      displayName: rows[0].display_name,
      token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async resetPasswordWithToken(token: string, newPassword: string): Promise<PasswordResetResult> {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ id: string; user_id: string; email: string }>(
        `SELECT prt.id, prt.user_id, u.email
         FROM password_reset_tokens prt
         JOIN users u ON u.id = prt.user_id
         WHERE prt.token_hash = $1
           AND prt.used_at IS NULL
           AND prt.expires_at > NOW()
         FOR UPDATE OF prt`,
        [hashRefreshToken(token)],
      );
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return { ok: false, code: 'invalid_or_expired_token' };
      }

      await client.query(`UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`, [
        rows[0].user_id,
        passwordHash,
      ]);
      await client.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [
        rows[0].id,
      ]);
      // A credential reset invalidates every device session for the account.
      await client.query(`DELETE FROM user_sessions WHERE user_id = $1`, [rows[0].user_id]);
      await client.query('COMMIT');
      return { ok: true, userId: rows[0].user_id, email: rows[0].email };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async getById(id: string): Promise<UserProfile | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT ${USER_SELECT_COLUMNS} FROM users WHERE id = $1`,
      [id],
    );
    return rows.length > 0 ? rowToProfile(rows[0]) : null;
  }

  async setAdminRole(userId: string, adminRole: AdminRole | null): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE users
       SET role = $2,
           admin_role = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [userId, adminRole ? 'admin' : 'user', adminRole],
    );
    return (rowCount ?? 0) > 0;
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

  async getAdminMetrics(): Promise<SubscriptionAdminMetrics> {
    const { rows } = await this.pool.query<{
      total_users: string;
      free_users: string;
      pro_users: string;
      team_users: string;
      active_paid_users: string;
      past_due_users: string;
      canceling_users: string;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE role = 'user')::text AS total_users,
        COUNT(*) FILTER (WHERE role = 'user' AND subscription = 'free')::text AS free_users,
        COUNT(*) FILTER (WHERE role = 'user' AND subscription = 'pro')::text AS pro_users,
        COUNT(*) FILTER (WHERE role = 'user' AND subscription = 'team')::text AS team_users,
        COUNT(*) FILTER (
          WHERE role = 'user'
            AND subscription <> 'free'
            AND billing_status IN ('active', 'trialing', 'past_due')
        )::text AS active_paid_users,
        COUNT(*) FILTER (WHERE role = 'user' AND billing_status = 'past_due')::text AS past_due_users,
        COUNT(*) FILTER (
          WHERE role = 'user'
            AND subscription <> 'free'
            AND cancel_at_period_end = TRUE
        )::text AS canceling_users
      FROM users
    `);
    const row = rows[0];
    const totalUsers = Number(row?.total_users ?? 0);
    const teamUsers = Number(row?.team_users ?? 0);
    const activePaidUsers = Number(row?.active_paid_users ?? 0);
    return {
      totalUsers,
      freeUsers: Number(row?.free_users ?? 0),
      proUsers: Number(row?.pro_users ?? 0),
      teamUsers,
      activePaidUsers,
      pastDueUsers: Number(row?.past_due_users ?? 0),
      cancelingUsers: Number(row?.canceling_users ?? 0),
      paidConversionRate: totalUsers > 0 ? activePaidUsers / totalUsers : null,
      teamMixRate: activePaidUsers > 0 ? teamUsers / activePaidUsers : null,
    };
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
