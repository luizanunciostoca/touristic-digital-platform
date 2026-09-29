export interface AffiliateAcquisitionPolicyV2 {
  readonly version: "AFFILIATE-POLICY-V2";
  readonly attributionWindowDays: number;
  readonly reacquisitionInactivityDays: number;
  readonly minimumMeaningfulSignals: number;
}

export interface AffiliateAcquisitionPolicyV2Input {
  readonly attributionWindowDays: number;
  readonly reacquisitionInactivityDays: number;
  readonly minimumMeaningfulSignals: number;
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function createAffiliateAcquisitionPolicyV2(
  input: AffiliateAcquisitionPolicyV2Input,
): AffiliateAcquisitionPolicyV2 {
  if (!isPositiveInteger(input.attributionWindowDays)) {
    throw new Error("ACQUISITION_V2_ATTRIBUTION_WINDOW_INVALID");
  }
  if (!isPositiveInteger(input.reacquisitionInactivityDays)) {
    throw new Error("ACQUISITION_V2_INACTIVITY_WINDOW_INVALID");
  }
  if (!isPositiveInteger(input.minimumMeaningfulSignals)) {
    throw new Error("ACQUISITION_V2_SIGNAL_THRESHOLD_INVALID");
  }

  return Object.freeze({
    version: "AFFILIATE-POLICY-V2",
    attributionWindowDays: input.attributionWindowDays,
    reacquisitionInactivityDays: input.reacquisitionInactivityDays,
    minimumMeaningfulSignals: input.minimumMeaningfulSignals,
  });
}
