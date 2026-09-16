from pathlib import Path

root = Path("apps/morro-digital-platform/src/map")
actions = root / "explore-location-actions-v1.ts"
flow = root / "explore-locations-v1-flow.ts"


def one(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


a = actions.read_text(encoding="utf-8")
a = one(
    a,
    'const CATEGORY_PLACE_ACTIONS: Readonly<\n  Record<string, readonly ActionSpec[]>\n> = Object.freeze({',
    'const CATEGORY_PLACE_ACTIONS = Object.freeze({',
    "action spec declaration",
)
a = one(
    a,
    '});\n\nexport function getV1ExplorePlaceActionOptions(',
    '} satisfies Readonly<Record<string, readonly ActionSpec[]>>);\n\nexport function getV1ExplorePlaceActionOptions(',
    "action spec satisfies",
)
a = one(
    a,
    '  const specs = CATEGORY_PLACE_ACTIONS[category];',
    '  const specs = (\n    CATEGORY_PLACE_ACTIONS as Readonly<Record<string, readonly ActionSpec[]>>\n  )[category];',
    "action dynamic lookup",
)
actions.write_text(a, encoding="utf-8")

f = flow.read_text(encoding="utf-8")
f = one(
    f,
    'const SUBCATEGORY_SPECS: Readonly<Record<string, readonly FilterSpec[]>> =\n  Object.freeze({',
    'const SUBCATEGORY_SPECS = Object.freeze({',
    "filter spec declaration",
)
f = one(
    f,
    '  });\n\nexport function getV1ExploreSubcategoryOptions(',
    '} satisfies Readonly<Record<string, readonly FilterSpec[]>>);\n\nexport function getV1ExploreSubcategoryOptions(',
    "filter spec satisfies",
)
f = one(
    f,
    '  const specs = SUBCATEGORY_SPECS[category];',
    '  const specs = (\n    SUBCATEGORY_SPECS as Readonly<Record<string, readonly FilterSpec[]>>\n  )[category];',
    "filter dynamic lookup",
)
flow.write_text(f, encoding="utf-8")
