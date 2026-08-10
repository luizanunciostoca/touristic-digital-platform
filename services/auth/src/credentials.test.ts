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

  it("requires a minimum normalized password length", () => {
    expect(() => hashPassword("short")).toThrow(
      "A senha precisa ter pelo menos 10 caracteres.",
    );
  });

  it("fails closed for malformed encoded hashes", () => {
    expect(verifyPassword("anything", "sha256$bad$bad")).toBe(false);
    expect(verifyPassword("anything", null)).toBe(false);
  });

  it("parses normalized configured users and preserves V1 role fallback", () => {
    const ownerHash = hashPassword("owner-password", Buffer.alloc(16, 1));
    const adminHash = hashPassword("admin-password", Buffer.alloc(16, 2));
    const users = parseConfiguredUsers(
      JSON.stringify([
        {
          email: " OWNER@EXAMPLE.COM ",
          passwordHash: ownerHash,
          role: "unexpected-role",
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

  it("rejects malformed configuration and non-admin users without scopes", () => {
    expect(() => parseConfiguredUsers("{")).toThrow(
      "DASHBOARD_USERS_JSON não contém JSON válido.",
    );
    expect(() => parseConfiguredUsers("{}")).toThrow(
      "DASHBOARD_USERS_JSON precisa ser uma lista.",
    );

    const passwordHash = hashPassword("owner-password", Buffer.alloc(16, 3));
    expect(() =>
      parseConfiguredUsers(
        JSON.stringify([
          {
            email: "owner@example.com",
            passwordHash,
            role: "owner",
            businessIds: [],
          },
        ]),
      ),
    ).toThrow("Usuário inválido em DASHBOARD_USERS_JSON na posição 0.");
  });
});
