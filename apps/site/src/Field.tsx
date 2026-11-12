import { createContext, useContext, useId, useState } from "react";
import { mediaUrl } from "@team6220/content";
import { prepareImage, type PreparedImage } from "./images";
import { defaultFor, labelFor, move, pathKey, variants, variantTag, type Path, type Schema } from "./schema";

/** Images chosen in this editing session, by the path the content file will use. The Editor commits the ones still in use. */
export interface PendingImages {
  files: Record<string, PreparedImage>;
  add: (image: PreparedImage) => void;
}
export const ImagesContext = createContext<PendingImages>({ files: {}, add: () => {} });

export interface FieldProps {
  schema: Schema;
  value: unknown;
  path: Path;
  /** Validation messages by path ("blocks.2.text"). */
  errors: Record<string, string[]>;
  onChange: (path: Path, value: unknown) => void;
}

/** One field of the generated form. Recurses through objects, lists and block variants. */
export default function Field(props: FieldProps) {
  const { schema, value, path } = props;
  const key = path[path.length - 1];

  if (variants(schema)) return <VariantField {...props} />;
  if (schema.const !== undefined) return null; // the block's `type` tag: chosen when the block is added

  switch (schema.type) {
    case "boolean":
      return <BooleanField {...props} label={labelFor(schema, key)} />;
    case "string":
      if (schema.ui === "image") return <ImageField {...props} label={labelFor(schema, key)} />;
      if (schema.enum) return <SelectField {...props} label={labelFor(schema, key)} />;
      return <TextField {...props} label={labelFor(schema, key)} />;
    case "array":
      return <ListField {...props} label={labelFor(schema, key)} />;
    case "object":
      return (
        <div className="site__group">
          {Object.entries(schema.properties ?? {}).map(([k, s]) => (
            <Field key={k} schema={s} value={(value as Record<string, unknown>)[k]} path={[...path, k]} errors={props.errors} onChange={props.onChange} />
          ))}
        </div>
      );
    default:
      return <p className="site__error">This field type isn't supported by the editor yet ({String(schema.type)}).</p>;
  }
}

function Errors({ errors, path }: { errors: Record<string, string[]>; path: Path }) {
  const list = errors[pathKey(path)];
  if (!list?.length) return null;
  return (
    <ul className="site__field-errors" role="alert">
      {list.map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
}

function BooleanField({ schema, value, path, errors, onChange, label }: FieldProps & { label: string }) {
  const id = useId();
  return (
    <div className="site__field site__field--check">
      <label htmlFor={id}>
        <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(path, e.target.checked)} /> <b>{label}</b>
      </label>
      {schema.description && <p className="site__hint">{schema.description}</p>}
      <Errors errors={errors} path={path} />
    </div>
  );
}

function TextField({ schema, value, path, errors, onChange, label }: FieldProps & { label: string }) {
  const id = useId();
  const text = typeof value === "string" ? value : "";
  const long = schema.ui === "textarea";
  const bad = !!errors[pathKey(path)]?.length;
  return (
    <div className="site__field">
      <label htmlFor={id}>
        <b>{label}</b>
      </label>
      {long ? (
        <textarea id={id} value={text} rows={Math.min(14, Math.max(3, Math.ceil(text.length / 80) + 1))} maxLength={schema.maxLength} aria-invalid={bad} onChange={(e) => onChange(path, e.target.value)} />
      ) : (
        <input id={id} type="text" value={text} maxLength={schema.maxLength} aria-invalid={bad} onChange={(e) => onChange(path, e.target.value)} />
      )}
      {schema.description && <p className="site__hint">{schema.description}</p>}
      <Errors errors={errors} path={path} />
    </div>
  );
}

function SelectField({ schema, value, path, errors, onChange, label }: FieldProps & { label: string }) {
  const id = useId();
  return (
    <div className="site__field">
      <label htmlFor={id}>
        <b>{label}</b>
      </label>
      <select id={id} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(path, e.target.value)}>
        {schema.enum!.map((o) => (
          <option key={o} value={o}>
            {o === "" ? "(none)" : o}
          </option>
        ))}
      </select>
      {schema.description && <p className="site__hint">{schema.description}</p>}
      <Errors errors={errors} path={path} />
    </div>
  );
}

/** Pick an image file: checked against the upload limits, previewed, and committed with the pull request on Submit. */
function ImageField({ schema, value, path, errors, onChange, label }: FieldProps & { label: string }) {
  const id = useId();
  const images = useContext(ImagesContext);
  const [problem, setProblem] = useState<string | null>(null);
  const current = typeof value === "string" ? value : "";
  const pending = images.files[current];
  const preview = pending ? pending.dataUrl : current ? mediaUrl(current) : "";

  async function pick(file: File | undefined) {
    if (!file) return;
    setProblem(null);
    try {
      const prepared = await prepareImage(file);
      images.add(prepared);
      onChange(path, prepared.path);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  }

  return (
    <div className="site__field site__image">
      <label htmlFor={id}>
        <b>{label}</b>
      </label>
      {preview && <img className="site__preview" src={preview} alt={`Preview of ${label.toLowerCase()}`} style={{ maxHeight: 80, maxWidth: 240, display: "block", margin: "6px 0" }} />}
      {current && (
        <p className="site__hint">
          <code>{current}</code>
          {pending ? " (new, uploaded when you submit)" : ""}
        </p>
      )}
      <input id={id} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      {current && (
        <button type="button" className="t-button t-button--quiet" onClick={() => onChange(path, "")}>
          Remove image
        </button>
      )}
      {schema.description && <p className="site__hint">{schema.description}</p>}
      {problem && (
        <p className="site__error" role="alert">
          {problem}
        </p>
      )}
      <Errors errors={errors} path={path} />
    </div>
  );
}

function ListField({ schema, value, path, errors, onChange, label }: FieldProps & { label: string }) {
  const items = Array.isArray(value) ? value : [];
  const itemSchema = schema.items!;
  const options = variants(itemSchema);
  const max = schema.maxItems ?? Infinity;
  const min = schema.minItems ?? 0;
  const set = (next: unknown[]) => onChange(path, next);
  const addVariant = (index: number) => set([...items, defaultFor(options![index]!)]);

  return (
    <fieldset className="site__list">
      <legend>{label}</legend>
      <Errors errors={errors} path={path} />
      <ol className="site__items">
        {items.map((item, i) => {
          const variant = options ? options.find((o) => variantTag(o) === (item as { type?: string })?.type) : undefined;
          const title = variant ? labelFor(variant, undefined) : `${label.replace(/\s*\(.*\)$/, "").replace(/s$/, "")} ${i + 1}`;
          return (
            <li key={i} className="site__item">
              <div className="site__item-head">
                <span className="site__item-title">
                  {variant ? `${i + 1}. ` : ""}
                  {title}
                </span>
                <span className="site__item-actions">
                  <button type="button" className="t-button t-button--quiet" onClick={() => set(move(items, i, i - 1))} disabled={i === 0} aria-label={`Move ${title} ${i + 1} up`}>
                    Up
                  </button>
                  <button type="button" className="t-button t-button--quiet" onClick={() => set(move(items, i, i + 1))} disabled={i === items.length - 1} aria-label={`Move ${title} ${i + 1} down`}>
                    Down
                  </button>
                  <button type="button" className="t-button t-button--quiet" onClick={() => set(items.filter((_, j) => j !== i))} disabled={items.length <= min} aria-label={`Remove ${title} ${i + 1}`}>
                    Remove
                  </button>
                </span>
              </div>
              <Field schema={variant ?? itemSchema} value={item} path={[...path, i]} errors={errors} onChange={onChange} />
            </li>
          );
        })}
      </ol>
      {items.length < max && (
        <div className="site__add">
          {options ? (
            options.map((o, idx) => (
              <button key={variantTag(o) ?? idx} type="button" className="t-button t-button--quiet" onClick={() => addVariant(idx)}>
                Add {labelFor(o, undefined).toLowerCase()}
              </button>
            ))
          ) : (
            <button type="button" className="t-button t-button--quiet" onClick={() => set([...items, defaultFor(itemSchema)])}>
              Add {label.toLowerCase().replace(/s$/, "")}
            </button>
          )}
        </div>
      )}
    </fieldset>
  );
}

/** An object that is one of several shapes (block types). The shape is fixed once added; remove and re-add to change it. */
function VariantField({ schema, value, path, errors, onChange }: FieldProps) {
  const options = variants(schema)!;
  const tag = (value as { type?: string } | undefined)?.type;
  const variant = options.find((o) => variantTag(o) === tag);
  if (!variant) return <p className="site__error">Unknown kind of block "{String(tag)}".</p>;
  return <Field schema={variant} value={value} path={path} errors={errors} onChange={onChange} />;
}
