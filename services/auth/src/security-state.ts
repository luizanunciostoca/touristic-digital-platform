import { createHash } from "node:crypto";

import type { RevocableAuthSession } from "./revocation.js";

const sessionRegistryRetentionSeconds = 30 * 24 * 60 * 60;

export interface AuthLoginRateLimitPolicy {
  readonly windowMs: number;
  readonly limit: number;
}

export interface AuthSqlConnection {
  readonly beginTransaction: () => Promise<void>;
  readonly execute: (
    sql: string,
    values?: readonly unknown[],
  ) => Promise<readonly [unknown, unknown]>;
  readonly commit: () => Promise<void>;
  readonly rollback: () => Promise<void>;
  readonly release: () => void;
}

export interface AuthSqlPool {
  readonly query: (
    sql: string,
    values?: readonly unknown[],
  ) => Promise<readonly [unknown, unknown]>;
  readonly execute: (
    sql: string,
    values?: readonly unknown[],
  ) => Promise<readonly [unknown, unknown]>;
  readonly getConnection: () => Promise<AuthSqlConnection>;
  readonly end: () => Promise<void>;
}

export interface RegisterableAuthSession extends RevocableAuthSession {
  readonly subject: string;
  readonly issuedAt: number;
}

export interface AuthSessionRecord {
  readonly handle: string;
  readonly subject: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly revokedAt: number | null;
  readonly active: boolean;
}

export interface AuthSessionRevocationResult {
  readonly found: boolean;
  readonly alreadyRevoked: boolean;
}

export interface AuthSecurityState {
  readonly initialize: () => Promise<void>;
  readonly consumeLoginAttempt: (
    key: string,
    policy: AuthLoginRateLimitPolicy,
    nowMs?: number,
  ) => Promise<boolean>;
  readonly isRevoked: (
    sessionId: string,
    nowEpochSeconds?: number,
  ) => Promise<boolean>;
  readonly registerSession: (session: RegisterableAuthSession) => Promise<void>;
  readonly listSessions: (
    subject: string,
    nowEpochSeconds?: number,
  ) => Promise<readonly AuthSessionRecord[]>;
  readonly revokeSessionHandle: (
    subject: string,
    handle: string,
    nowEpochSeconds?: number,
  ) => Promise<AuthSessionRevocationResult>;
  readonly revoke: (session: RevocableAuthSession) => Promise<void>;
  readonly close: () => Promise<void>;
}

interface LoginRateLimitRow {
  readonly window_started_at: string | number;
  readonly attempts: string | number;
}

interface RevocationRow {
  readonly expires_at: string | number;
}

interface SessionRegistryRow {
  readonly session_key: string;
  readonly actor_subject: string;
  readonly issued_at: string | number;
  readonly expires_at: string | number;
  readonly revoked_at: string | number | null;
}

export const authSecuritySchemaStatements = Object.freeze([
  `CREATE TABLE IF NOT EXISTS auth_session_revocations (
    session_key CHAR(64) NOT NULL PRIMARY KEY,
    expires_at BIGINT UNSIGNED NOT NULL,
    revoked_at BIGINT UNSIGNED NOT NULL,
    INDEX idx_auth_session_revocations_expires_at (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS auth_login_rate_limits (
    limiter_key CHAR(64) NOT NULL PRIMARY KEY,
    window_started_at BIGINT UNSIGNED NOT NULL,
    attempts INT UNSIGNED NOT NULL,
    updated_at BIGINT UNSIGNED NOT NULL,
    INDEX idx_auth_login_rate_limits_updated_at (updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS auth_session_registry (
    session_key CHAR(64) NOT NULL PRIMARY KEY,
    actor_subject VARCHAR(191) NOT NULL,
    issued_at BIGINT UNSIGNED NOT NULL,
    expires_at BIGINT UNSIGNED NOT NULL,
    revoked_at BIGINT UNSIGNED NULL,
    INDEX idx_auth_session_registry_subject_issued (actor_subject, issued_at),
    INDEX idx_auth_session_registry_expires_at (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]);

export const authSessionRegistryRollbackSql =
  "DROP TABLE IF EXISTS auth_session_registry";

function hashedKey(namespace: string, value: string): string {
  return createHash("sha256").update(`${namespace}:${value}`).digest("hex");
}

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

function normalizedSubject(value: string): string {
  const subject = value.trim();
  if (!subject || subject.length > 191 || containsControlCharacter(subject)) {
    throw new Error("Auth session subject is invalid.");
  }
  return subject;
}

function normalizedSessionHandle(value: string): string {
  const handle = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(handle)) {
    throw new Error("Auth session handle is invalid.");
  }
  return handle;
}

function sessionRecord(
  row: SessionRegistryRow,
  nowEpochSeconds: number,
): AuthSessionRecord {
  const expiresAt = Number(row.expires_at);
  const revokedAt = row.revoked_at === null ? null : Number(row.revoked_at);
  return Object.freeze({
    handle: row.session_key,
    subject: row.actor_subject,
    issuedAt: Number(row.issued_at),
    expiresAt,
    revokedAt,
    active: revokedAt === null && expiresAt > nowEpochSeconds,
  });
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive safe integer.`);
  }
  return value;
}

function normalizedNowMs(value: number | undefined): number {
  const now = Math.floor(value ?? Date.now());
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error("Auth security-state clock is invalid.");
  }
  return now;
}

function normalizedEpochSeconds(value: number | undefined): number {
  const now = Math.floor(value ?? Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error("Auth revocation clock is invalid.");
  }
  return now;
}

function rowsFromResult<T>(result: unknown): readonly T[] {
  return Array.isArray(result) ? (result as readonly T[]) : [];
}

async function rollbackQuietly(connection: AuthSqlConnection): Promise<void> {
  try {
    await connection.rollback();
  } catch {
    return;
  }
}

export function createInMemoryAuthSecurityState(): AuthSecurityState {
  const attempts = new Map<
    string,
    { windowStartedAt: number; attempts: number }
  >();
  const revoked = new Map<string, number>();
  const sessions = new Map<
    string,
    {
      subject: string;
      issuedAt: number;
      expiresAt: number;
      revokedAt: number | null;
    }
  >();

  function initialize(): Promise<void> {
    return Promise.resolve();
  }

  function consumeLoginAttempt(
    key: string,
    policy: AuthLoginRateLimitPolicy,
    nowInput?: number,
  ): Promise<boolean> {
    const now = normalizedNowMs(nowInput);
    const windowMs = positiveInteger(
      policy.windowMs,
      "Login rate-limit windowMs",
    );
    const limit = positiveInteger(policy.limit, "Login rate-limit limit");
    const hashed = hashedKey("login", key);
    const current = attempts.get(hashed);
    const expired = !current || now - current.windowStartedAt >= windowMs;
    const next = expired
      ? { windowStartedAt: now, attempts: 1 }
      : {
          windowStartedAt: current.windowStartedAt,
          attempts: current.attempts + 1,
        };
    attempts.set(hashed, next);
    return Promise.resolve(next.attempts <= limit);
  }

  function isRevoked(sessionId: string, nowInput?: number): Promise<boolean> {
    const now = normalizedEpochSeconds(nowInput);
    const key = hashedKey("session", sessionId);
    const expiresAt = revoked.get(key);
    if (expiresAt === undefined) return Promise.resolve(false);
    if (expiresAt <= now) {
      revoked.delete(key);
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  }

  function registerSession(session: RegisterableAuthSession): Promise<void> {
    const subject = normalizedSubject(session.subject);
    const issuedAt = normalizedEpochSeconds(session.issuedAt);
    const expiresAt = normalizedEpochSeconds(session.expiresAt);
    if (expiresAt <= issuedAt) {
      throw new Error("Auth session expiry must be after issuance.");
    }
    sessions.set(hashedKey("session", session.sessionId), {
      subject,
      issuedAt,
      expiresAt,
      revokedAt: null,
    });
    return Promise.resolve();
  }

  function listSessions(
    subjectInput: string,
    nowInput?: number,
  ): Promise<readonly AuthSessionRecord[]> {
    const subject = normalizedSubject(subjectInput);
    const now = normalizedEpochSeconds(nowInput);
    const records = [...sessions.entries()]
      .filter(([, session]) => session.subject === subject)
      .map(([handle, session]) =>
        sessionRecord(
          {
            session_key: handle,
            actor_subject: session.subject,
            issued_at: session.issuedAt,
            expires_at: session.expiresAt,
            revoked_at: session.revokedAt,
          },
          now,
        ),
      )
      .sort((left, right) => right.issuedAt - left.issuedAt)
      .slice(0, 100);
    return Promise.resolve(Object.freeze(records));
  }

  function revokeSessionHandle(
    subjectInput: string,
    handleInput: string,
    nowInput?: number,
  ): Promise<AuthSessionRevocationResult> {
    const subject = normalizedSubject(subjectInput);
    const handle = normalizedSessionHandle(handleInput);
    const now = normalizedEpochSeconds(nowInput);
    const session = sessions.get(handle);
    if (!session || session.subject !== subject) {
      return Promise.resolve(
        Object.freeze({ found: false, alreadyRevoked: false }),
      );
    }
    const alreadyRevoked =
      session.revokedAt !== null || session.expiresAt <= now;
    revoked.set(handle, session.expiresAt);
    sessions.set(handle, {
      ...session,
      revokedAt: session.revokedAt ?? now,
    });
    return Promise.resolve(Object.freeze({ found: true, alreadyRevoked }));
  }

  function revoke(session: RevocableAuthSession): Promise<void> {
    const now = normalizedEpochSeconds(undefined);
    const handle = hashedKey("session", session.sessionId);
    revoked.set(handle, session.expiresAt);
    const registered = sessions.get(handle);
    if (registered) {
      sessions.set(handle, {
        ...registered,
        revokedAt: registered.revokedAt ?? now,
      });
    }
    return Promise.resolve();
  }

  function close(): Promise<void> {
    attempts.clear();
    revoked.clear();
    sessions.clear();
    return Promise.resolve();
  }

  return Object.freeze({
    initialize,
    consumeLoginAttempt,
    isRevoked,
    registerSession,
    listSessions,
    revokeSessionHandle,
    revoke,
    close,
  });
}

export function createSqlAuthSecurityState(
  pool: AuthSqlPool,
  options: { readonly closePool?: boolean } = {},
): AuthSecurityState {
  const closePool = options.closePool ?? true;
  let initialized = false;
  let lastCleanupMs = 0;

  async function cleanupExpired(
    nowMs: number,
    windowMs: number,
  ): Promise<void> {
    const cleanupIntervalMs = Math.max(windowMs, 60_000);
    if (nowMs - lastCleanupMs < cleanupIntervalMs) return;
    lastCleanupMs = nowMs;
    const nowEpochSeconds = Math.floor(nowMs / 1000);
    const sessionRegistryCutoff = Math.max(
      0,
      nowEpochSeconds - sessionRegistryRetentionSeconds,
    );
    const rateLimitCutoff = Math.max(0, nowMs - windowMs * 2);
    await Promise.all([
      pool.execute(
        "DELETE FROM auth_session_revocations WHERE expires_at <= ? LIMIT 1000",
        [nowEpochSeconds],
      ),
      pool.execute(
        "DELETE FROM auth_session_registry WHERE expires_at <= ? LIMIT 1000",
        [sessionRegistryCutoff],
      ),
      pool.execute(
        "DELETE FROM auth_login_rate_limits WHERE updated_at < ? LIMIT 1000",
        [rateLimitCutoff],
      ),
    ]);
  }

  async function initialize(): Promise<void> {
    if (initialized) return;
    for (const statement of authSecuritySchemaStatements) {
      await pool.query(statement);
    }
    initialized = true;
  }

  async function consumeLoginAttempt(
    key: string,
    policy: AuthLoginRateLimitPolicy,
    nowInput?: number,
  ): Promise<boolean> {
    await initialize();
    const now = normalizedNowMs(nowInput);
    const windowMs = positiveInteger(
      policy.windowMs,
      "Login rate-limit windowMs",
    );
    const limit = positiveInteger(policy.limit, "Login rate-limit limit");
    const limiterKey = hashedKey("login", key);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO auth_login_rate_limits
          (limiter_key, window_started_at, attempts, updated_at)
         VALUES (?, ?, 0, ?)
         ON DUPLICATE KEY UPDATE limiter_key = VALUES(limiter_key)`,
        [limiterKey, now, now],
      );
      const [result] = await connection.execute(
        `SELECT window_started_at, attempts
           FROM auth_login_rate_limits
          WHERE limiter_key = ?
          FOR UPDATE`,
        [limiterKey],
      );
      const current = rowsFromResult<LoginRateLimitRow>(result)[0];
      if (!current) throw new Error("AUTH_RATE_LIMIT_STATE_MISSING");

      const windowStartedAt = Number(current.window_started_at);
      const reset = now - windowStartedAt >= windowMs;
      const nextWindowStartedAt = reset ? now : windowStartedAt;
      const nextAttempts = reset ? 1 : Number(current.attempts) + 1;
      await connection.execute(
        `UPDATE auth_login_rate_limits
            SET window_started_at = ?, attempts = ?, updated_at = ?
          WHERE limiter_key = ?`,
        [nextWindowStartedAt, nextAttempts, now, limiterKey],
      );
      await connection.commit();
      void cleanupExpired(now, windowMs).catch(() => undefined);
      return nextAttempts <= limit;
    } catch (error) {
      await rollbackQuietly(connection);
      throw error;
    } finally {
      connection.release();
    }
  }

  async function isRevoked(
    sessionId: string,
    nowInput?: number,
  ): Promise<boolean> {
    await initialize();
    const now = normalizedEpochSeconds(nowInput);
    const sessionKey = hashedKey("session", sessionId);
    const [result] = await pool.execute(
      `SELECT expires_at
         FROM auth_session_revocations
        WHERE session_key = ?
        LIMIT 1`,
      [sessionKey],
    );
    const row = rowsFromResult<RevocationRow>(result)[0];
    if (!row) return false;
    const expiresAt = Number(row.expires_at);
    if (expiresAt > now) return true;
    await pool.execute(
      "DELETE FROM auth_session_revocations WHERE session_key = ? AND expires_at <= ?",
      [sessionKey, now],
    );
    return false;
  }

  async function registerSession(
    session: RegisterableAuthSession,
  ): Promise<void> {
    await initialize();
    const subject = normalizedSubject(session.subject);
    const issuedAt = normalizedEpochSeconds(session.issuedAt);
    const expiresAt = normalizedEpochSeconds(session.expiresAt);
    if (expiresAt <= issuedAt) {
      throw new Error("Auth session expiry must be after issuance.");
    }
    await pool.execute(
      `INSERT INTO auth_session_registry
        (session_key, actor_subject, issued_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, NULL)
       ON DUPLICATE KEY UPDATE
         expires_at = GREATEST(expires_at, VALUES(expires_at))`,
      [hashedKey("session", session.sessionId), subject, issuedAt, expiresAt],
    );
  }

  async function listSessions(
    subjectInput: string,
    nowInput?: number,
  ): Promise<readonly AuthSessionRecord[]> {
    await initialize();
    const subject = normalizedSubject(subjectInput);
    const now = normalizedEpochSeconds(nowInput);
    const [result] = await pool.execute(
      `SELECT session_key, actor_subject, issued_at, expires_at, revoked_at
         FROM auth_session_registry
        WHERE actor_subject = ?
        ORDER BY issued_at DESC
        LIMIT 100`,
      [subject],
    );
    return Object.freeze(
      rowsFromResult<SessionRegistryRow>(result).map((row) =>
        sessionRecord(row, now),
      ),
    );
  }

  async function revokeSessionHandle(
    subjectInput: string,
    handleInput: string,
    nowInput?: number,
  ): Promise<AuthSessionRevocationResult> {
    await initialize();
    const subject = normalizedSubject(subjectInput);
    const handle = normalizedSessionHandle(handleInput);
    const now = normalizedEpochSeconds(nowInput);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        `SELECT session_key, actor_subject, issued_at, expires_at, revoked_at
           FROM auth_session_registry
          WHERE session_key = ? AND actor_subject = ?
          FOR UPDATE`,
        [handle, subject],
      );
      const row = rowsFromResult<SessionRegistryRow>(result)[0];
      if (!row) {
        await connection.commit();
        return Object.freeze({ found: false, alreadyRevoked: false });
      }

      const expiresAt = Number(row.expires_at);
      const alreadyRevoked = row.revoked_at !== null || expiresAt <= now;
      await connection.execute(
        `INSERT INTO auth_session_revocations
          (session_key, expires_at, revoked_at)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           expires_at = GREATEST(expires_at, VALUES(expires_at)),
           revoked_at = VALUES(revoked_at)`,
        [handle, expiresAt, now],
      );
      await connection.execute(
        `UPDATE auth_session_registry
            SET revoked_at = COALESCE(revoked_at, ?)
          WHERE session_key = ? AND actor_subject = ?`,
        [now, handle, subject],
      );
      await connection.commit();
      return Object.freeze({ found: true, alreadyRevoked });
    } catch (error) {
      await rollbackQuietly(connection);
      throw error;
    } finally {
      connection.release();
    }
  }

  async function revoke(session: RevocableAuthSession): Promise<void> {
    await initialize();
    const now = normalizedEpochSeconds(undefined);
    const handle = hashedKey("session", session.sessionId);
    await pool.execute(
      `INSERT INTO auth_session_revocations
        (session_key, expires_at, revoked_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         expires_at = GREATEST(expires_at, VALUES(expires_at)),
         revoked_at = VALUES(revoked_at)`,
      [handle, session.expiresAt, now],
    );
    await pool.execute(
      `UPDATE auth_session_registry
          SET revoked_at = COALESCE(revoked_at, ?)
        WHERE session_key = ?`,
      [now, handle],
    );
  }

  async function close(): Promise<void> {
    if (closePool) await pool.end();
  }

  return Object.freeze({
    initialize,
    consumeLoginAttempt,
    isRevoked,
    registerSession,
    listSessions,
    revokeSessionHandle,
    revoke,
    close,
  });
}
