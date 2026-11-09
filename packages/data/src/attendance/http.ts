// Transport to the real "attendance API" Apps Script web app.
//
// Apps Script can't answer CORS preflight (OPTIONS) requests, so this must stay a "simple" request:
// POST, Content-Type text/plain, no custom headers, no cookies. The JSON goes in the body.
// Apps Script answers with a redirect to script.googleusercontent.com, which fetch follows.
import { AttendanceError, type Transport } from "./types";

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
      throw new AttendanceError("network", "Couldn't reach the attendance server. Check the internet connection.");
    }
    if (!res.ok) {
      throw new AttendanceError("network", `The attendance server answered ${res.status}. Try again.`);
    }
    try {
      return (await res.json()) as Record<string, unknown>;
    } catch {
      // Apps Script returns an HTML page when the deployment is wrong (e.g. not "Anyone" access).
      throw new AttendanceError("server-error", "The attendance server sent an unexpected answer.");
    }
  };
}
