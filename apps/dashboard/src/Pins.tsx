// The pins row on Home: the same pins as the frame's pins menu, each with its key (1 to 0).
import { frame, useFramePrefs, type FramePin } from "@team6220/ui";

export function Pins() {
  const [prefs] = useFramePrefs(); // re-render when pins change
  const pins: FramePin[] = prefs ? frame().pins?.() ?? [] : [];
  if (!pins.length) return null;
  const keyed = pins.filter((p) => p.key).length;
  return (
    <section className="k-section">
      <div className="k-section-head">
        <h3 className="k-label">Pins · <a className="k-link" href="/apps/account#pins">Edit</a></h3>
        {keyed > 0 && <span className="k-section-right k-hint">Press S, then 1–{keyed % 10} on your keyboard to open one</span>}
      </div>
      <div className="k-row">
        {pins.map((p) => (
          <a key={p.id} className="dash-pin" href={p.url} target={p.ext ? "_blank" : undefined} rel="noopener">
            {p.key && <kbd className="dash-kbd">{p.key}</kbd>}
            <span>{p.name}</span>
            {p.ext && <span aria-label="opens in a new tab">↗</span>}
          </a>
        ))}
      </div>
    </section>
  );
}
