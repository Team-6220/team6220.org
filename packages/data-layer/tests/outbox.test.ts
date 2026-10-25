import { describe, expect, it } from "vitest";
import { DataLayerError, Outbox, mapError, warnBeforeUnload } from "../src/index.js";

/** Manual timer queue so retries run deterministically. */
function manualTimers() {
  const due: (() => void)[] = [];
  return { setTimer: (fn: () => void) => due.push(fn), flush: () => due.splice(0).forEach((f) => f()) };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("Outbox", () => {
  it("retries network failures while the tab is open, then resolves", async () => {
    const t = manualTimers();
    const ob = new Outbox({ setTimer: t.setTimer });
    let calls = 0;
    const p = ob.enqueue("design:1", async () => {
      calls++;
      if (calls < 3) throw new DataLayerError("network", "offline");
      return "saved";
    });
    await tick();
    expect(ob.pending).toBe(1);
    t.flush();
    await tick();
    t.flush();
    expect(await p).toBe("saved");
    expect(calls).toBe(3);
    expect(ob.pending).toBe(0);
  });

  it("does not retry validation or permission errors", async () => {
    const ob = new Outbox();
    await expect(ob.enqueue("x", async () => Promise.reject(new DataLayerError("forbidden", "no")))).rejects.toMatchObject({ code: "forbidden" });
    expect(ob.pending).toBe(0);
  });

  it("collapses queued saves of the same item (latest wins)", async () => {
    const t = manualTimers();
    const ob = new Outbox({ setTimer: t.setTimer });
    const saved: string[] = [];
    let online = false;
    const save = (v: string) => async () => {
      if (!online) throw new TypeError("Failed to fetch");
      saved.push(v);
      return v;
    };
    const a = ob.enqueue("doc", save("first"));
    await tick();
    const b = ob.enqueue("doc", save("second"));
    await tick();
    const c = ob.enqueue("doc", save("third"));
    const other = ob.enqueue("other", save("other"));
    await tick();
    expect(ob.pending).toBe(2);
    online = true;
    t.flush();
    // Superseded saves resolve with the newest version; only it is written.
    expect(await a).toBe("third");
    expect(await b).toBe("third");
    expect(await c).toBe("third");
    expect(await other).toBe("other");
    expect(saved).toEqual(["third", "other"]);
  });

  it("warnBeforeUnload blocks closing only while work is unsaved", () => {
    let handler: ((e: Event) => void) | null = null;
    const target = { addEventListener: (_: string, h: EventListener) => (handler = h), removeEventListener: () => (handler = null) };
    let unsaved = true;
    const detach = warnBeforeUnload(() => unsaved, target as unknown as Window);
    const ev = { preventDefault: () => (ev.prevented = true), prevented: false, returnValue: undefined as unknown };
    handler!(ev as unknown as Event);
    expect(ev.prevented).toBe(true);
    unsaved = false;
    const ev2 = { preventDefault: () => (ev2.prevented = true), prevented: false };
    handler!(ev2 as unknown as Event);
    expect(ev2.prevented).toBe(false);
    detach();
    expect(handler).toBeNull();
  });
});

describe("mapError", () => {
  it("maps database errors to data-layer codes", () => {
    expect(mapError({ message: "quota: Team storage is full" })).toMatchObject({ code: "quota", message: "Team storage is full" });
    expect(mapError({ message: "new row violates row-level security policy", code: "42501" }).code).toBe("forbidden");
    expect(mapError(new TypeError("Failed to fetch")).code).toBe("network");
    expect(mapError({ message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" }).code).toBe("not_found");
  });
});
