// The pins row on Home: the same pins as the frame's pins menu. Home shows no keys; the pins menu and Account do.
import { frame, useFramePrefs, type FramePin } from "@team6220/ui";

export function Pins() {
  const [prefs] = useFramePrefs(); // re-render when pins change
  const pins: FramePin[] = prefs ? frame().pins?.() ?? [] : [];
  if (!pins.length) return null;
  return (
    <section className="k-section">
      <div className="k-section-head">
        <h3 className="k-label">Pins · <a className="k-link" href="/apps/account#pins">Edit</a></h3>
      </div>
      <div className="k-row">
        {pins.map((p) => (
          <a key={p.id} className="dash-pin" href={p.url} target={p.ext ? "_blank" : undefined} rel="noopener">
            <span>{p.name}</span>
            {p.ext && <span aria-label="opens in a new tab">↗</span>}
          </a>
        ))}
      </div>
    </section>
  );
}
