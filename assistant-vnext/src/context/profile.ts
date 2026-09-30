import { z } from "zod";
import type { AssistantLocale, AssistantUserType, Result } from "../core/contracts.js";
import { err, ok, SUPPORTED_LOCALES, USER_TYPES } from "../core/contracts.js";

export const ProfileContextSchema = z
  .object({
    locale: z.enum(SUPPORTED_LOCALES),
    userType: z.enum(USER_TYPES),
    interests: z.array(z.string().min(1).max(80)).max(20),
    preferences: z
      .record(z.string().max(80), z.string().max(240))
      .refine((value) => Object.keys(value).length <= 30, "Too many preferences"),
    behavioralHints: z.array(z.string().min(1).max(120)).max(20),
    recentPlaceIds: z.array(z.string().min(1).max(120)).max(20),
    favoritePlaceIds: z.array(z.string().min(1).max(120)).max(100),
    durablePreferenceRefs: z.array(z.string().min(1).max(160)).max(50),
  })
  .strict();

export type ProfileContext = z.infer<typeof ProfileContextSchema>;

export interface ProfileContextProvider {
  getProfile(
    args: Readonly<{ userId?: string; localeHint?: AssistantLocale }>,
  ): Promise<Result<ProfileContext>>;
}

export class FixtureProfileContextProvider implements ProfileContextProvider {
  constructor(private readonly profile: ProfileContext) {}

  getProfile(): Promise<Result<ProfileContext>> {
    const parsed = ProfileContextSchema.safeParse(this.profile);
    if (!parsed.success) {
      return Promise.resolve(err("VALIDATION_FAILED", "fixture profile failed validation"));
    }
    return Promise.resolve(ok(parsed.data));
  }
}

export class UnknownProfileContextProvider implements ProfileContextProvider {
  getProfile(args: Readonly<{ localeHint?: AssistantLocale }>): Promise<Result<ProfileContext>> {
    return Promise.resolve(
      ok({
        locale: args.localeHint ?? "pt",
        userType: "unknown",
        interests: [],
        preferences: {},
        behavioralHints: [],
        recentPlaceIds: [],
        favoritePlaceIds: [],
        durablePreferenceRefs: [],
      }),
    );
  }
}

export function deriveAuthenticatedUserType(
  base: AssistantUserType,
  authenticated: boolean,
): AssistantUserType {
  if (!authenticated) {
    if (base === "authenticated_tourist") return "tourist";
    if (base === "authenticated_resident") return "resident";
    return base;
  }
  if (base === "tourist") return "authenticated_tourist";
  if (base === "resident") return "authenticated_resident";
  return base;
}
