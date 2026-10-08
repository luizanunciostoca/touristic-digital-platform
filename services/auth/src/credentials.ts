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
  requiresBusinessScope,
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

function opaquePassword(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 400) return null;
  const characters = Array.from(value);
  if (characters.length > 200) return null;
  // Unpaired surrogates would collapse to the same UTF-8 replacement byte sequence.
  if (
    characters.some((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint >= 0xd800 && codePoint <= 0xdfff;
    })
  )
    return null;
  return value;
}

function decodePasswordHash(
  encoded: unknown,
): { salt: Buffer; hash: Buffer } | null {
  if (
    typeof encoded !== "string" ||
    !/^scrypt\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/u.test(encoded)
  )
    return null;
  const [, encodedSalt, encodedHash] = encoded.split("$");
  const salt = Buffer.from(encodedSalt!, "base64url");
  const hash = Buffer.from(encodedHash!, "base64url");
  if (
    salt.length !== 16 ||
    hash.length !== 64 ||
    salt.toString("base64url") !== encodedSalt ||
    hash.toString("base64url") !== encodedHash
  )
    return null;
  return { salt, hash };
}

export function hashPassword(
  password: unknown,
  salt = randomBytes(16),
): string {
  const opaque = opaquePassword(password);
  if (opaque === null || Array.from(opaque).length < 10) {
    throw new Error(
      "A senha precisa ter pelo menos 10 caracteres. O limite é 200 caracteres Unicode válidos.",
    );
  }
  if (!Buffer.isBuffer(salt) || salt.length !== 16)
    throw new Error("Salt de senha inválido.");
  const derived = scryptSync(opaque, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function verifyPassword(password: unknown, encoded: unknown): boolean {
  const decoded = decodePasswordHash(encoded);
  const opaque = opaquePassword(password);
  if (!decoded || opaque === null) return false;

  try {
    const actual = scryptSync(opaque, decoded.salt, 64);
    return timingSafeEqual(decoded.hash, actual);
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

  const ids = new Set<string>();
  const emails = new Set<string>();
  const users = parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(
        `Usuário inválido em DASHBOARD_USERS_JSON na posição ${index}.`,
      );
    }

    const record = entry as Record<string, unknown>;
    const email = normalizeAuthEmail(record.email);
    const passwordHash =
      typeof record.passwordHash === "string" ? record.passwordHash : "";
    const role: AuthRole | null = isAuthRole(record.role) ? record.role : null;
    const businessIds = normalizeBusinessScopes(record.businessIds);
    if (
      !email ||
      !decodePasswordHash(passwordHash) ||
      !role ||
      (requiresBusinessScope(role) && businessIds.length === 0)
    ) {
      throw new Error(
        `Usuário inválido em DASHBOARD_USERS_JSON na posição ${index}.`,
      );
    }

    const id =
      safeString(record.id, 100) ||
      createHash("sha256").update(email).digest("hex").slice(0, 20);

    if (ids.has(id) || emails.has(email)) {
      throw new Error(
        `Usuário duplicado em DASHBOARD_USERS_JSON na posição ${index}.`,
      );
    }
    ids.add(id);
    emails.add(email);

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
