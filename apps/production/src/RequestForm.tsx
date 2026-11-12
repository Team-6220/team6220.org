// Design > Request a part. Replaces the "Production Form" Google Form.
import { useState, type FormEvent } from "react";
import { production, type PartMethod, type PartPriority, type PartRequest, type Project } from "@team6220/data";
import { ProjectPicker } from "@team6220/ui";

const EMPTY: PartRequest = {
  partName: "", projectId: "", taskId: "", cadLink: "", fileLinks: "", material: production.COMMON_MATERIALS[0], thickness: "",
  length: 0, width: 0, quantity: 1, method: "handmade", accuracy: "", priority: "normal", dueDate: "", details: "",
  print: { filament: "", color: "", estMinutes: 0, estGrams: 0 },
};

interface RequestFormProps {
  projects: Project[];
  /** Filled in when the form was opened from an Icarus task ("Request a part for this task"). */
  forTask?: { taskId: string; projectId: string };
  onSubmit: (request: PartRequest) => Promise<void>;
}

export function RequestForm({ projects, forTask, onSubmit }: RequestFormProps) {
  const [draft, setDraft] = useState<PartRequest>({ ...EMPTY, ...forTask });
  const [saving, setSaving] = useState(false);
  const set = (changes: Partial<PartRequest>) => setDraft({ ...draft, ...changes });
  const setPrint = (changes: NonNullable<PartRequest["print"]>) => set({ print: { ...draft.print, ...changes } });
  const number = (value: string) => Number(value) || 0;
  const [stlUnit, setStlUnit] = useState<"in" | "mm">("in");
  const [stlNote, setStlNote] = useState("");

  /** Fills in the size from an STL file: longest side is the length, then width, and the thinnest is the thickness. */
  async function fromStl(file: File | undefined) {
    if (!file) return;
    try {
      const { dims } = production.stlSize(await file.arrayBuffer());
      const toIn = stlUnit === "mm" ? 1 / 25.4 : 1;
      const [length, width, thick] = dims.map((d) => Math.round(d * toIn * 1000) / 1000);
      set({ length, width, thickness: `${thick}"`, partName: draft.partName || file.name.replace(/\.stl$/i, ""), fileLinks: draft.fileLinks || file.name });
      setStlNote(`From ${file.name}: ${length} × ${width} × ${thick} in. Check these match the CAD.`);
    } catch (err) {
      setStlNote(err instanceof Error ? err.message : "That file couldn't be read.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(draft);
      // Keep the project, material and method: designers often submit several similar parts in a row.
      setDraft({ ...draft, partName: "", cadLink: "", fileLinks: "", details: "", length: 0, width: 0, quantity: 1 });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="t-panel" onSubmit={submit}>
      <h2>Request a part</h2>
      {draft.taskId && <p className="t-status t-status--ok">This part will be linked to the Icarus task you came from.</p>}
      <div className="prod__stl">
        <label className="t-button t-button--quiet">
          Fill in the size from an STL file
          <input type="file" accept=".stl" hidden onChange={(e) => void fromStl(e.target.files?.[0])} />
        </label>
        <label>
          exported in{" "}
          <select value={stlUnit} onChange={(e) => setStlUnit(e.target.value as "in" | "mm")} aria-label="STL units">
            <option value="in">inches</option>
            <option value="mm">millimetres</option>
          </select>
        </label>
        {stlNote && <span className="t-hint">{stlNote}</span>}
      </div>
      <div className="prod__fields">
        <label className="t-field prod__wide">
          Part name (same as in CAD)
          <input value={draft.partName} onChange={(e) => set({ partName: e.target.value })} maxLength={150} required />
        </label>
        <label className="t-field">
          Method
          <select value={draft.method} onChange={(e) => set({ method: e.target.value as PartMethod })}>
            {(Object.keys(production.METHOD_LABELS) as PartMethod[]).map((m) => <option key={m} value={m}>{production.METHOD_LABELS[m]}</option>)}
          </select>
        </label>
        <label className="t-field">
          Material
          <input list="prod-materials" value={draft.material} onChange={(e) => set({ material: e.target.value })} required />
          <datalist id="prod-materials">{production.COMMON_MATERIALS.map((m) => <option key={m} value={m} />)}</datalist>
        </label>
        <label className="t-field">
          Thickness / size
          <input value={draft.thickness} onChange={(e) => set({ thickness: e.target.value })} placeholder={'1/4", 1x2 tube…'} />
        </label>
        <label className="t-field">
          Length (in)
          <input type="number" min="0" step="any" value={draft.length || ""} onChange={(e) => set({ length: number(e.target.value) })} />
        </label>
        <label className="t-field">
          Width (in)
          <input type="number" min="0" step="any" value={draft.width || ""} onChange={(e) => set({ width: number(e.target.value) })} />
        </label>
        <label className="t-field">
          Quantity
          <input type="number" min="1" step="1" value={draft.quantity} onChange={(e) => set({ quantity: Math.floor(number(e.target.value)) })} required />
        </label>
        <label className="t-field">
          Accuracy
          <input value={draft.accuracy} onChange={(e) => set({ accuracy: e.target.value })} placeholder="±1/32, ±0.005…" />
        </label>
        <label className="t-field">
          Priority
          <select value={draft.priority} onChange={(e) => set({ priority: e.target.value as PartPriority })}>
            {(Object.keys(production.PRIORITY_LABELS) as PartPriority[]).map((p) => <option key={p} value={p}>{production.PRIORITY_LABELS[p]}</option>)}
          </select>
        </label>
        <label className="t-field">
          Due date (if any)
          <input type="date" value={draft.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
        </label>
        <ProjectPicker projects={projects} value={draft.projectId} onChange={(projectId) => set({ projectId })} />
        <label className="t-field prod__wide">
          CAD link
          <input type="url" value={draft.cadLink} onChange={(e) => set({ cadLink: e.target.value })} placeholder="https://cad.onshape.com/…" />
        </label>
        <label className="t-field prod__wide">
          Files (links to drawings, DXF or STL in Drive)
          <input value={draft.fileLinks} onChange={(e) => set({ fileLinks: e.target.value })} />
        </label>
        {draft.method === "print" && (
          <>
            <label className="t-field">
              Filament
              <input value={draft.print?.filament ?? ""} onChange={(e) => setPrint({ filament: e.target.value })} placeholder="PLA, PETG…" />
            </label>
            <label className="t-field">
              Color
              <input value={draft.print?.color ?? ""} onChange={(e) => setPrint({ color: e.target.value })} />
            </label>
            <label className="t-field">
              Print time (minutes, from the slicer)
              <input type="number" min="0" value={draft.print?.estMinutes || ""} onChange={(e) => setPrint({ estMinutes: number(e.target.value) })} />
            </label>
            <label className="t-field">
              Filament (grams)
              <input type="number" min="0" value={draft.print?.estGrams || ""} onChange={(e) => setPrint({ estGrams: number(e.target.value) })} />
            </label>
          </>
        )}
        <label className="t-field prod__wide">
          Important details
          <textarea rows={2} value={draft.details} onChange={(e) => set({ details: e.target.value })} maxLength={2000} />
        </label>
      </div>
      {draft.method === "shapeoko" && <p className="t-hint">Shapeoko parts wait in “Shapeoko pending” until someone sets the stock size and toolpath.</p>}
      <button className="t-button" type="submit" disabled={saving || !draft.partName.trim()}>
        Submit part
      </button>
    </form>
  );
}
