// The profile picture box on Account and "Finish your profile": drop a picture or click to choose one. It is shrunk to
// a 256px square in the browser, then saved straight away.
import { useState } from "react";
import { account } from "@team6220/data";

export function PhotoField({ current, onSaved }: { current?: string; onSaved?: (url: string) => void }) {
  const [url, setUrl] = useState(current);
  const [state, setState] = useState<"" | "busy" | "saved" | "error">("");
  const [over, setOver] = useState(false);

  const save = async (file?: File) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) return setState("error");
    setState("busy");
    try {
      const saved = await account.setPhoto(await account.shrinkPhoto(file));
      setUrl(saved);
      setState("saved");
      onSaved?.(saved);
    } catch {
      setState("error");
    }
  };

  return (
    <div className="k-field k-field--wide">
      Profile picture
      <label className={`dash-photo${over ? " is-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); save(e.dataTransfer.files[0]); }}>
        {url ? <img className="dash-photo-img" src={url} alt="" /> : <span className="dash-photo-img" aria-hidden="true" />}
        <span className="k-hint">{state === "busy" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "That picture didn't save. Try a JPEG or PNG." : "Optional: drop a photo or click to choose"}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" className="dash-photo-input" onChange={(e) => save(e.target.files?.[0])} disabled={state === "busy"} />
      </label>
    </div>
  );
}
