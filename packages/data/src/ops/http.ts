// Transport to the real "ops API" Apps Script web app (backend/apps-script/ops-api).
//
// Apps Script can't answer CORS preflight (OPTIONS) requests, so this must stay a "simple" request:
// POST, Content-Type text/plain, no custom headers, no cookies. The JSON goes in the body.
import { OpsError, type Transport } from "./types";

export function httpTransport(url: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): Transport {
  return async (request) => {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(request),
        credentials: "omit",
        redirect: "follow",
      });
    } catch {
      throw new OpsError("network", "Couldn't reach the team server. Check the internet connection.");
    }
    if (!res.ok) throw new OpsError("network", `The team server answered ${res.status}. Try again.`);
    try {
      return (await res.json()) as Record<string, unknown>;
    } catch {
      // Apps Script returns an HTML page when the deployment is wrong (e.g. not "Anyone" access).
      throw new OpsError("server-error", "The team server sent an unexpected answer.");
    }
  };
}
