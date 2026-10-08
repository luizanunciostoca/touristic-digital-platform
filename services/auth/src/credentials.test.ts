import { scryptSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  hashPassword,
  parseConfiguredUsers,
  verifyPassword,
} from "./credentials.js";

describe("M48 auth credentials", () => {
  it("hashes and verifies scrypt passwords", () => {
    const encoded = hashPassword(
      "correct horse battery staple",
      Buffer.alloc(16, 7),
    );
    expect(encoded.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("correct horse battery staple", encoded)).toBe(true);
    expect(verifyPassword("wrong password", encoded)).toBe(false);
  });

  it("requires a minimum password length", () => {
    expect(() => hashPassword("short")).toThrow(
      "A senha precisa ter pelo menos 10 caracteres.",
    );
  });

  it.each(["ordinary-legacy-password", "😀".repeat(5)])(
    "verifies legacy digests without imposing the new creation minimum: %j",
    (password) => {
      const salt = Buffer.alloc(16, 5);
      const digest = scryptSync(password, salt, 64);
      const encoded = `scrypt$${salt.toString("base64url")}$${digest.toString("base64url")}`;
      expect(verifyPassword(password, encoded)).toBe(true);
      expect(verifyPassword(password + "!", encoded)).toBe(false);
    },
  );

  it.each([
    ["alpha  beta gamma", "alpha beta gamma"],
    [" password-long ", "password-long"],
    ["alpha\tbeta gamma", "alpha beta gamma"],
    ["alpha\u0000beta gamma", "alpha beta gamma"],
  ])("preserves the exact password %j", (password, different) => {
    const encoded = hashPassword(password, Buffer.alloc(16, 4));
    expect(verifyPassword(password, encoded)).toBe(true);
    expect(verifyPassword(different, encoded)).toBe(false);
  });

  it("rejects oversized or non-string passwords without truncation", () => {
    const password = "a".repeat(200);
    const encoded = hashPassword(password, Buffer.alloc(16, 4));
    expect(verifyPassword(password, encoded)).toBe(true);
    expect(verifyPassword(password + "b", encoded)).toBe(false);
    expect(() => hashPassword(password + "b")).toThrow();
    expect(() => hashPassword(null)).toThrow();
    expect(verifyPassword(null, encoded)).toBe(false);
    const unicode = "😀".repeat(200);
    expect(verifyPassword(unicode, hashPassword(unicode))).toBe(true);
    expect(() => hashPassword(unicode + "😀")).toThrow();
    expect(() => hashPassword("password-long\ud800")).toThrow();
    expect(
      verifyPassword("password-long\ud800", hashPassword("password-long�")),
    ).toBe(false);
  });

  it("rejects malformed and noncanonical scrypt encodings", () => {
    const valid = hashPassword(
      "correct horse battery staple",
      Buffer.alloc(16, 7),
    );
    const [, salt, digest] = valid.split("$");
    const malformed = [
      "scrypt$!!!$!!!",
      `scrypt$${salt}$AA`,
      `scrypt$AA$${digest}`,
      `scrypt$${salt}=$${digest}`,
      `scrypt$${salt}$${digest}=`,
      `scrypt$${salt}$${digest}$extra`,
      `scrypt$${salt?.slice(0, -1)}x$${digest}`,
      `scrypt$${salt}$${digest?.slice(0, -1)}B`,
    ];
    for (const encoded of malformed) {
      expect(verifyPassword("correct horse battery staple", encoded)).toBe(
        false,
      );
      expect(() =>
        parseConfiguredUsers(
          JSON.stringify([
            {
              id: "owner",
              email: "owner@example.com",
              passwordHash: encoded,
              role: "owner",
              businessIds: ["business-1"],
            },
          ]),
        ),
      ).toThrow("Usuário inválido em DASHBOARD_USERS_JSON na posição 0.");
    }
    expect(() =>
      hashPassword("correct horse battery staple", Buffer.alloc(0)),
    ).toThrow();
  });

  it("rejects duplicate normalized email and principal ids", () => {
    const owner = {
      id: "owner-1",
      email: "owner@example.com",
      passwordHash: hashPassword("owner-password", Buffer.alloc(16, 3)),
      role: "owner",
      businessIds: ["business-1"],
    };
    for (const duplicate of [
      { ...owner, id: "other", email: " OWNER@EXAMPLE.COM " },
      { ...owner, id: " owner-1 ", email: "other@example.com" },
    ]) {
      expect(() =>
        parseConfiguredUsers(JSON.stringify([owner, duplicate])),
      ).toThrow();
    }
    const derived = parseConfiguredUsers(
      JSON.stringify([{ ...owner, id: undefined }]),
    )[0]!.id;
    expect(() =>
      parseConfiguredUsers(
        JSON.stringify([
          { ...owner, id: undefined },
          { ...owner, id: derived, email: "other@example.com" },
        ]),
      ),
    ).toThrow();
  });

  it("fails closed for malformed encoded hashes", () => {
    expect(verifyPassword("anything", "sha256$bad$bad")).toBe(false);
    expect(verifyPassword("anything", null)).toBe(false);
  });

  it("parses normalized configured users only with explicit valid roles", () => {
    const ownerHash = hashPassword("owner-password", Buffer.alloc(16, 1));
    const adminHash = hashPassword("admin-password", Buffer.alloc(16, 2));
    const users = parseConfiguredUsers(
      JSON.stringify([
        {
          email: " OWNER@EXAMPLE.COM ",
          passwordHash: ownerHash,
          role: "owner",
          businessIds: ["Toca_Do-Morcego", "toca_do-morcego"],
        },
        {
          id: "admin-1",
          email: "admin@example.com",
          passwordHash: adminHash,
          role: "admin",
          businessIds: [],
        },
      ]),
    );

    expect(users).toHaveLength(2);
    expect(users[0]?.email).toBe("owner@example.com");
    expect(users[0]?.role).toBe("owner");
    expect(users[0]?.businessIds).toEqual(["toca_do-morcego"]);
    expect(users[0]?.id).toHaveLength(20);
    expect(users[1]?.id).toBe("admin-1");
    expect(users[1]?.role).toBe("admin");
  });

  it("rejects malformed configuration, invalid roles and missing scopes", () => {
    expect(() => parseConfiguredUsers("{")).toThrow(
      "DASHBOARD_USERS_JSON não contém JSON válido.",
    );
    expect(() => parseConfiguredUsers("{}")).toThrow(
      "DASHBOARD_USERS_JSON precisa ser uma lista.",
    );

    const passwordHash = hashPassword("owner-password", Buffer.alloc(16, 3));
    const invalidUsers = [
      {
        email: "owner@example.com",
        passwordHash,
        role: "unexpected-role",
        businessIds: ["toca-do-morcego"],
      },
      {
        email: "owner@example.com",
        passwordHash,
        businessIds: ["toca-do-morcego"],
      },
      {
        email: "owner@example.com",
        passwordHash,
        role: "owner",
        businessIds: [],
      },
    ];

    for (const user of invalidUsers) {
      expect(() => parseConfiguredUsers(JSON.stringify([user]))).toThrow(
        "Usuário inválido em DASHBOARD_USERS_JSON na posição 0.",
      );
    }
  });
});
