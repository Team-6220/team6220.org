// Choosing many table rows quickly, the way a spreadsheet does:
//   click            tick or untick one row
//   shift + click    tick every row from the last one clicked to this one
//   drag             press on one row's box and drag over others to tick (or untick) them all
// `ids` is every row that can be chosen, in the order they appear on screen.
import { useCallback, useEffect, useRef, useState } from "react";

export function useSelection(ids: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  /** While dragging: are we ticking (true) or unticking (false)? Null when not dragging. */
  const dragging = useRef<boolean | null>(null);

  // Rows that disappeared (signed, removed) can't stay chosen.
  useEffect(() => {
    setSelected((old) => new Set([...old].filter((id) => ids.includes(id))));
  }, [ids.join("|")]);

  useEffect(() => {
    const stop = () => (dragging.current = null);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  const set = useCallback((changed: string[], on: boolean) => {
    setSelected((old) => {
      const next = new Set(old);
      for (const id of changed) on ? next.add(id) : next.delete(id);
      return next;
    });
  }, []);

  /** Put on the row's tick-box cell as onPointerDown. */
  const press = (id: string, shiftKey: boolean) => {
    if (shiftKey && anchor.current && ids.includes(anchor.current)) {
      const [from, to] = [ids.indexOf(anchor.current), ids.indexOf(id)].sort((a, b) => a - b);
      set(ids.slice(from, to + 1), true);
      return;
    }
    const on = !selected.has(id);
    set([id], on);
    anchor.current = id;
    dragging.current = on;
  };

  /** Put on the row as onPointerEnter. */
  const dragOver = (id: string) => {
    if (dragging.current !== null && ids.includes(id)) set([id], dragging.current);
  };

  return {
    selected,
    press,
    dragOver,
    /** Tick these rows (for "Select section" and "Select all"). */
    add: (more: string[]) => set(more.filter((id) => ids.includes(id)), true),
    clear: () => setSelected(new Set()),
  };
}
