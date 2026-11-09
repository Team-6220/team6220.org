import { h } from "./dom.js";

export function download(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

/**
 * Asks the user for a JSON file and parses it. The contents are untrusted: callers must validate
 * against a schema before use. Rejects files over maxBytes.
 */
export function pickJsonFile(maxBytes = 5_000_000): Promise<{ name: string; data: unknown }> {
  return new Promise((resolve, reject) => {
    const input = h("input", { type: "file", accept: ".json,application/json", style: "display:none" });
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return reject(new Error("No file chosen."));
      if (file.size > maxBytes) return reject(new Error(`File is too large (${(file.size / 1e6).toFixed(1)} MB; limit ${(maxBytes / 1e6).toFixed(0)} MB).`));
      try {
        resolve({ name: file.name, data: JSON.parse(await file.text()) });
      } catch {
        reject(new Error(`${file.name} is not valid JSON.`));
      }
    });
    document.body.appendChild(input);
    input.click();
  });
}

export async function copyText(text: string, fallback?: HTMLTextAreaElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (fallback) {
      fallback.select();
      return document.execCommand("copy");
    }
    return false;
  }
}
