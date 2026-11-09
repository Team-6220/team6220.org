import { h } from "./dom.js";

/**
 * Reminder shown wherever work can be saved: a file on your own computer is the safest copy.
 * TODO(Phase 2): also show this beside the cloud "Save to team" action once Supabase saving is connected.
 */
export function localSaveNotice(): HTMLElement {
  return h(
    "div",
    { class: "notice", role: "note" },
    h("b", null, "Saving to your computer (Export) is the safest option. "),
    "Cloud saving is experimental, so download anything important.",
  );
}
