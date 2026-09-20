export const PUBLIC_ONBOARDING_STORAGE_KEY = "morro-digital-onboarded";

export interface PublicOnboardingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function hasCompletedPublicOnboarding(
  storage: PublicOnboardingStorage | null | undefined,
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(PUBLIC_ONBOARDING_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function persistPublicOnboardingCompletion(
  storage: PublicOnboardingStorage | null | undefined,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PUBLIC_ONBOARDING_STORAGE_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

export function resolvePublicOnboardingStorage(
  document: Document,
): PublicOnboardingStorage | null {
  try {
    return document.defaultView?.localStorage ?? null;
  } catch {
    return null;
  }
}
