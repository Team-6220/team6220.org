// Helpers for the form that is generated from an area's JSON Schema (made from its Zod schema by @team6220/content).
// Only the parts of JSON Schema our content files use are supported: object, array, string, boolean,
// `const` and `oneOf` (Zod's discriminated unions). To add a new kind of field, extend Field.tsx and this file.

export interface Schema {
  type?: "object" | "array" | "string" | "boolean" | "number" | "integer";
  title?: string;
  description?: string;
  /** Our own hint from `.meta({ ui: "textarea" })` */
  ui?: "textarea" | "image";
  enum?: string[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  oneOf?: Schema[];
  anyOf?: Schema[];
  const?: unknown;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
}

export type Path = (string | number)[];

export function variants(schema: Schema | undefined): Schema[] | undefined {
  return schema?.oneOf ?? schema?.anyOf;
}

/** "ordered" -> "Ordered" when the schema has no title. */
export function labelFor(schema: Schema, key: string | number | undefined): string {
  if (schema.title) return schema.title;
  if (typeof key === "number") return "Text"; // a plain string inside a list
  const k = String(key ?? "");
  return k ? k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, " $1").toLowerCase() : "";
}

/** The `type` constant of an object variant (e.g. "paragraph"), if it has one. */
export function variantTag(schema: Schema): string | undefined {
  const tag = schema.properties?.type?.const;
  return typeof tag === "string" ? tag : undefined;
}

/** A new, empty value for a schema (what "Add" puts in the list). */
export function defaultFor(schema: Schema): unknown {
  const options = variants(schema);
  if (options) return defaultFor(options[0]!);
  if (schema.const !== undefined) return schema.const;
  switch (schema.type) {
    case "object": {
      const out: Record<string, unknown> = {};
      for (const [k, s] of Object.entries(schema.properties ?? {})) out[k] = defaultFor(s);
      return out;
    }
    case "array":
      return Array.from({ length: schema.minItems ?? 0 }, () => defaultFor(schema.items!));
    case "boolean":
      return false;
    case "number":
    case "integer":
      return 0;
    default:
      return "";
  }
}

export function setAt<T>(root: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path as [string | number, ...Path];
  if (Array.isArray(root)) {
    const copy = root.slice();
    copy[head as number] = setAt(copy[head as number], rest, value);
    return copy as T;
  }
  const obj = { ...(root as Record<string, unknown>) };
  obj[head as string] = setAt(obj[head as string], rest, value);
  return obj as T;
}

export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const copy = list.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item!);
  return copy;
}

export function pathKey(path: Path): string {
  return path.join(".");
}
