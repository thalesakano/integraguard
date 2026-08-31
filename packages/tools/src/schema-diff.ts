export type ShapeDiffKind =
  | "required-field-added"
  | "field-removed"
  | "type-changed"
  | "object-array-divergent"
  | "none";

export interface ShapeDiff {
  kind: ShapeDiffKind;
  path: string;
  expected?: string;
  observed?: string;
}

function typeofShape(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function shapeOf(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.length === 0 ? [] : [shapeOf(value[0])];
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = shapeOf(v);
    }
    return out;
  }
  return typeofShape(value);
}

/**
 * Structural diff between an expected schema/shape and an observed JSON body.
 * Domain-agnostic — no vendor-specific field names.
 */
export function diffShapes(expected: unknown, observed: unknown, path = "$"): ShapeDiff[] {
  const diffs: ShapeDiff[] = [];
  const expType = typeofShape(expected);
  const obsType = typeofShape(observed);

  if (expType !== obsType && !(expType === "object" && obsType === "object")) {
    if (
      (expType === "array" && obsType !== "array") ||
      (obsType === "array" && expType !== "array") ||
      (expType === "object" && obsType !== "object") ||
      (obsType === "object" && expType !== "object")
    ) {
      diffs.push({
        kind: "object-array-divergent",
        path,
        expected: expType,
        observed: obsType,
      });
      return diffs;
    }
    if (expType !== "object" && obsType !== "object" && expType !== "array" && obsType !== "array") {
      diffs.push({
        kind: "type-changed",
        path,
        expected: String(expected),
        observed: String(observed),
      });
      return diffs;
    }
  }

  if (
    typeof expected === "object" &&
    expected !== null &&
    !Array.isArray(expected) &&
    typeof observed === "object" &&
    observed !== null &&
    !Array.isArray(observed)
  ) {
    const expKeys = Object.keys(expected as object);
    const obsKeys = Object.keys(observed as object);
    for (const key of obsKeys) {
      if (!expKeys.includes(key)) {
        diffs.push({
          kind: "required-field-added",
          path: `${path}.${key}`,
          observed: typeofShape((observed as Record<string, unknown>)[key]),
        });
      }
    }
    for (const key of expKeys) {
      if (!obsKeys.includes(key)) {
        diffs.push({
          kind: "field-removed",
          path: `${path}.${key}`,
          expected: typeofShape((expected as Record<string, unknown>)[key]),
        });
      } else {
        diffs.push(
          ...diffShapes(
            (expected as Record<string, unknown>)[key],
            (observed as Record<string, unknown>)[key],
            `${path}.${key}`
          )
        );
      }
    }
    return diffs;
  }

  if (Array.isArray(expected) && Array.isArray(observed)) {
    if (expected.length > 0 && observed.length > 0) {
      return diffShapes(expected[0], observed[0], `${path}[]`);
    }
    return diffs;
  }

  if (typeof expected === "string" && typeof observed === "string" && expected !== observed) {
    // type labels like "string" vs "number"
    if (["string", "number", "boolean", "null"].includes(expected) || ["string", "number", "boolean", "null"].includes(observed)) {
      diffs.push({ kind: "type-changed", path, expected, observed });
    }
  }

  return diffs;
}

export function normalizeToShape(value: unknown): unknown {
  return shapeOf(value);
}

export function summarizeDiffs(diffs: ShapeDiff[]): ShapeDiffKind {
  if (diffs.length === 0) return "none";
  return diffs[0]!.kind;
}
