import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

import {
  isAuthRole,
  normalizeAuthEmail,
  normalizeBusinessScopes,
  type AuthRole,
} from "@touristic/auth";

export interface AuthConfiguredUser {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: AuthRole;
  readonly businessIds: readonly string[];
}

function stripControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? " " : character;
  }).join("");
}

function safeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return stripControlCharacters(value)
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

export function hashPassword(
  password: unknown,
  salt = randomBytes(16),
): string {
  const normalized = safeString(password, 200);
  if (normalized.length < 10) {
    throw new Error("A senha precisa ter pelo menos 10 caracteres.");
  }
  const derived = scryptSync(normalized, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function verifyPassword(password: unknown, encoded: unknown): boolean {
  if (typeof encoded !== "string") return false;
  const [scheme, encodedSalt, encodedHash, ...rest] = encoded.split("$");
  if (scheme !== "scrypt" || !encodedSalt || !encodedHash || rest.length > 0) {
    return false;
  }

  try {
    const salt = Buffer.from(encodedSalt, "base64url");
    const expected = Buffer.from(encodedHash, "base64url");
    const actual = scryptSync(safeString(password, 200), salt, expected.length);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}

export function parseConfiguredUsers(
  raw: string | null | undefined,
): readonly AuthConfiguredUser[] {
  if (!raw) return Object.freeze([]);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("DASHBOARD_USERS_JSON não contém JSON válido.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("DASHBOARD_USERS_JSON precisa ser uma lista.");
  }

  const users = parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(
        `Usuário inválido em DASHBOARD_USERS_JSON na posição ${index}.`,
      );
    }

    const record = entry as Record<string, unknown>;
    const email = normalizeAuthEmail(record.email);
    const passwordHash = safeString(record.passwordHash, 500);
    const role: AuthRole | null = isAuthRole(record.role) ? record.role : null;
    const businessIds = normalizeBusinessScopes(record.businessIds);
    if (
      !email ||
      !passwordHash ||
      !role ||
      (role !== "admin" && businessIds.length === 0)
    ) {
      throw new Error(
        `Usuário inválido em DASHBOARD_USERS_JSON na posição ${index}.`,
      );
    }

    const id =
      safeString(record.id, 100) ||
      createHash("sha256").update(email).digest("hex").slice(0, 20);

    return Object.freeze<AuthConfiguredUser>({
      id,
      email,
      passwordHash,
      role,
      businessIds,
    });
  });

  return Object.freeze(users);
}

export function authenticateConfiguredUser(
  users: readonly AuthConfiguredUser[],
  emailInput: unknown,
  passwordInput: unknown,
): AuthConfiguredUser | null {
  const email = normalizeAuthEmail(emailInput);
  const user = email
    ? users.find((candidate) => candidate.email === email)
    : undefined;
  const dummyHash = users[0]?.passwordHash;
  const passwordValid = verifyPassword(
    passwordInput,
    user?.passwordHash ?? dummyHash,
  );
  return user && passwordValid ? user : null;
}
