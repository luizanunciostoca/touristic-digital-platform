import type { Result } from "../core/contracts.js";
import { err, ok } from "../core/contracts.js";

export const EVIDENCE_SOURCE_TYPES = [
  "place",
  "business",
  "content",
  "weather",
  "commerce",
  "ticketing",
  "navigation",
  "profile",
  "payments",
] as const;
export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];

export interface EvidenceItem {
  readonly id: string;
  readonly source: string;
  readonly sourceType: EvidenceSourceType;
  readonly factType: string;
  readonly retrievedAt: string;
  readonly validUntil?: string;
  readonly confidence?: number;
  readonly canonicalRef?: string;
  readonly data: unknown;
}

export interface EvidenceConflict {
  readonly factType: string;
  readonly evidenceIds: readonly string[];
  readonly resolution: string;
}

export interface EvidencePack {
  readonly question: string;
  readonly items: readonly EvidenceItem[];
  readonly conflicts: readonly EvidenceConflict[];
  readonly missingFacts: readonly string[];
}

const SOURCE_AUTHORITY: Readonly<Record<string, readonly EvidenceSourceType[]>> = Object.freeze({
  hours: ["business", "place"],
  price: ["commerce", "business", "ticketing"],
  availability: ["ticketing", "commerce", "business"],
  weather: ["weather"],
  payment_status: ["payments", "ticketing"],
  event: ["content", "ticketing"],
});

export class AssistantEvidenceAggregator {
  build(
    args: Readonly<{
      question: string;
      items: readonly EvidenceItem[];
      requiredFacts: readonly string[];
      now: Date;
    }>,
  ): EvidencePack {
    const fresh = args.items.filter((item) => {
      if (!item.validUntil) return true;
      return new Date(item.validUntil).getTime() > args.now.getTime();
    });

    const conflicts: EvidenceConflict[] = [];
    for (const factType of new Set(fresh.map((item) => item.factType))) {
      const candidates = fresh.filter((item) => item.factType === factType);
      const serialized = new Set(candidates.map((item) => JSON.stringify(item.data)));
      if (serialized.size > 1) {
        conflicts.push({
          factType,
          evidenceIds: candidates.map((item) => item.id),
          resolution: "source-authority",
        });
      }
    }

    const selected = [...fresh].sort((a, b) => {
      const authority = SOURCE_AUTHORITY[a.factType] ?? [];
      const ai = authority.indexOf(a.sourceType);
      const bi = authority.indexOf(b.sourceType);
      const ar = ai < 0 ? 999 : ai;
      const br = bi < 0 ? 999 : bi;
      return ar - br;
    });

    const presentFacts = new Set(selected.map((item) => item.factType));
    return {
      question: args.question,
      items: selected,
      conflicts,
      missingFacts: args.requiredFacts.filter((fact) => !presentFacts.has(fact)),
    };
  }

  require(pack: EvidencePack, facts: readonly string[]): Result<EvidencePack> {
    const missing = facts.filter((fact) => !pack.items.some((item) => item.factType === fact));
    return missing.length === 0
      ? ok(pack)
      : err("INSUFFICIENT_EVIDENCE", "Required evidence is missing", false, {
          missingCount: missing.length,
        });
  }
}
