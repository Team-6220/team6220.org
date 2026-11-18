// Transport to the operations server (POST /api/ops, packages/data/src/ops/server). Sign-in is the session cookie, so
// there is no token to send; the server answers { ok: true, ... } or { ok: false, error, message } with a matching
// HTTP status, and the body is always read, so the message reaches the person.
import { OpsError, type Transport } from "./types";

export function httpTransport(url = "/api/ops", fetchImpl: typeof fetch = (...a) => fetch(...a)): Transport {
  return async (request) => {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        credentials: "same-origin",
      });
    } catch {
      throw new OpsError("network", "Couldn't reach the team server. Check the internet connection.");
    }
    try {
      return (await res.json()) as Record<string, unknown>;
    } catch {
      throw new OpsError("network", `The team server answered ${res.status} with something unexpected. Try again.`);
    }
  };
}
