import type { AuthSessionIdentity } from "@touristic/auth";

export interface AuthRevocationStore {
  readonly revoke: (session: AuthSessionIdentity) => void;
  readonly isRevoked: (sessionId: string, nowEpochSeconds?: number) => boolean;
  readonly cleanup: (nowEpochSeconds?: number) => number;
  readonly size: () => number;
}

export function createAuthRevocationStore(): AuthRevocationStore {
  const revoked = new Map<string, number>();

  const cleanup = (
    nowEpochSeconds = Math.floor(Date.now() / 1000),
  ): number => {
    let removed = 0;
    for (const [sessionId, expiresAt] of revoked.entries()) {
      if (expiresAt <= nowEpochSeconds) {
        revoked.delete(sessionId);
        removed += 1;
      }
    }
    return removed;
  };

  return Object.freeze({
    revoke(session) {
      revoked.set(session.sessionId, session.expiresAt);
    },
    isRevoked(sessionId, nowEpochSeconds = Math.floor(Date.now() / 1000)) {
      const expiresAt = revoked.get(sessionId);
      if (expiresAt === undefined) return false;
      if (expiresAt <= nowEpochSeconds) {
        revoked.delete(sessionId);
        return false;
      }
      return true;
    },
    cleanup,
    size() {
      return revoked.size;
    },
  });
}
