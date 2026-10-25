type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown> & { class?: string; style?: string };

/** Tiny element builder. `on*` attributes become event listeners. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === "class") el.className = String(v);
      else if (k in el && k !== "style" && k !== "list") (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
}

/** Text shown in the Karnivore title font. "6220" is written "622o" because it looks better in that font. */
export function titleText(text: string): string {
  return text.replace(/6220/g, "622o");
}

/** An element set in the title font, with the 6220 substitution applied. */
export function title<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, attrs: Attrs = {}): HTMLElementTagNameMap[K] {
  return h(tag, { ...attrs, class: `${attrs.class ?? ""} title`.trim() }, titleText(text));
}

export function toast(message: string, ms = 4000): void {
  const box = h("div", { class: "toast" }, h("div", { class: "grow" }, message), h("button", { class: "toast-x", onclick: () => box.remove(), "aria-label": "Dismiss" }, "×"));
  $("toast").appendChild(box);
  setTimeout(() => box.remove(), ms);
}

export function openModal(content: Node, onClose?: () => void): () => void {
  const modal = $("modal");
  clear(modal);
  const close = () => {
    modal.classList.remove("open");
    clear(modal);
    document.removeEventListener("keydown", esc);
    onClose?.();
  };
  const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
  document.addEventListener("keydown", esc);
  modal.appendChild(h("div", { class: "modal-box" }, content));
  modal.classList.add("open");
  return close;
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
