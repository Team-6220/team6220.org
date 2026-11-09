import { h } from "../ui/dom.js";
import { sfx } from "./sound.js";

/** Sound on/off checkbox and volume slider, kept in sync with the shared sound settings. */
export function soundControls(): HTMLElement {
  const toggle = h("input", { type: "checkbox", checked: sfx.enabled, onchange: (e: Event) => sfx.setEnabled((e.target as HTMLInputElement).checked) });
  const volume = h("input", {
    type: "range",
    min: "0",
    max: "1",
    step: "0.05",
    value: String(sfx.volume),
    oninput: (e: Event) => {
      sfx.setVolume(Number((e.target as HTMLInputElement).value));
      sfx.play("scoreActive"); // preview at the new volume
    },
  });
  // Unsubscribes itself once the controls leave the page.
  const off = sfx.onChange(() => {
    if (!toggle.isConnected) return off();
    toggle.checked = sfx.enabled;
    volume.value = String(sfx.volume);
  });
  return h(
    "div",
    { class: "col", style: "gap:4px" },
    h("label", { class: "row center small" }, toggle, "Sound effects"),
    h("div", { class: "row center small" }, h("span", { class: "muted" }, "Volume"), h("div", { class: "grow" }, volume)),
  );
}
