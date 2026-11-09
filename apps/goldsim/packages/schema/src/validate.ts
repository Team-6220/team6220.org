import type { TSchema, Static } from "@sinclair/typebox";
import { Value, type ValueError } from "@sinclair/typebox/value";

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

/** Turns a JSON pointer like /mechanisms/0/mount/x into mechanisms[0].mount.x. */
export function readablePath(pointer: string): string {
  if (!pointer) return "(root)";
  return pointer
    .split("/")
    .slice(1)
    .map((part, i) => (/^\d+$/.test(part) ? `[${part}]` : i === 0 ? part : `.${part}`))
    .join("");
}

function describe(error: ValueError): string {
  const desc = (error.schema as { description?: string }).description;
  return desc ? `${error.message} (expected: ${desc})` : error.message;
}

/** Validates untrusted data against a schema. Unknown extra fields are allowed but not used. */
export function validate<S extends TSchema>(schema: S, value: unknown): ValidationResult<Static<S>> {
  if (Value.Check(schema, value)) return { ok: true, value: value as Static<S> };
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const error of Value.Errors(schema, value)) {
    const path = readablePath(error.path);
    // Union failures report every branch; keep the first message per path.
    if (seen.has(path)) continue;
    seen.add(path);
    issues.push({ path, message: describe(error) });
    if (issues.length >= 25) break;
  }
  return { ok: false, issues };
}

export function formatIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => `  ${i.path}: ${i.message}`).join("\n");
}
