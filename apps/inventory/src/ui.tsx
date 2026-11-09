// Small shared UI pieces: dialogs, fields, toasts. Plain markup styled by styles.css.
import { useEffect, useId, useRef, type ReactNode } from "react";

export function Modal(props: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; kind?: "dialog" | "drawer" }) {
  const { title, onClose, children, footer, kind = "dialog" } = props;
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const first = boxRef.current?.querySelector<HTMLElement>("[autofocus], input, select, textarea, button.primary");
    first?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="inv-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`inv-${kind}`} role="dialog" aria-modal="true" aria-label={title} ref={boxRef}>
        <div className="inv-modal-head">
          <h2>{title}</h2>
          <button type="button" className="inv-icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="inv-modal-body">{children}</div>
        {footer && <div className="inv-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field(props: { label: string; hint?: string; error?: string; half?: boolean; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className={`inv-field${props.half ? " half" : ""}${props.error ? " has-error" : ""}`}>
      <label htmlFor={id}>{props.label}</label>
      {props.children(id)}
      {props.error ? <div className="inv-field-error">{props.error}</div> : props.hint ? <div className="inv-hint">{props.hint}</div> : null}
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
}

export function Select(props: { id?: string; value: string; options: SelectOption[]; empty?: string; onChange: (v: string) => void; ariaLabel?: string }) {
  const groups: { name: string; opts: SelectOption[] }[] = [];
  for (const o of props.options) {
    const g = groups[groups.length - 1];
    if (g && g.name === (o.group ?? "")) g.opts.push(o);
    else groups.push({ name: o.group ?? "", opts: [o] });
  }
  return (
    <select id={props.id} value={props.value} aria-label={props.ariaLabel} onChange={(e) => props.onChange(e.target.value)}>
      {props.empty !== undefined && <option value="">{props.empty}</option>}
      {groups.map((g, i) =>
        g.name ? (
          <optgroup key={i} label={g.name}>
            {g.opts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ) : (
          g.opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))
        ),
      )}
    </select>
  );
}

export interface Toast {
  id: number;
  message: string;
  type: "ok" | "error" | "info";
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="inv-toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`inv-toast ${t.type}`} role={t.type === "error" ? "alert" : "status"}>
          <span>{t.message}</span>
          <button type="button" className="inv-icon-btn" aria-label="Dismiss" onClick={() => onDismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function ConfirmDialog({ o, onDone }: { o: ConfirmOptions; onDone: (yes: boolean) => void }) {
  return (
    <Modal
      title={o.title}
      onClose={() => onDone(false)}
      footer={
        <>
          <button type="button" className="inv-btn" onClick={() => onDone(false)}>
            {o.cancelLabel ?? "Cancel"}
          </button>
          <button type="button" className={`inv-btn ${o.danger ? "danger" : "primary"}`} onClick={() => onDone(true)}>
            {o.confirmLabel ?? "OK"}
          </button>
        </>
      }
    >
      <div className="inv-confirm-msg">{o.message}</div>
    </Modal>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="inv-empty">
      <strong>{title}</strong>
      {children && <div>{children}</div>}
    </div>
  );
}
