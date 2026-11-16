// Form signups for the Site Manager (#76): who filled out each website form, and their emails ready to paste into an
// existing email thread. Browser-safe except WixSignupReader, which needs a Wix API key and only runs on the server.
//
// Each submission's answers are keyed by the form field's "target" (for example name_a1c2), which differs per form,
// so the name and email are found by pattern instead of a list of keys to keep up to date.
import { SiteError } from "./types";

/** The website's Wix forms. The IDs are public (the pages post to them); only reading submissions needs a key. */
export const SIGNUP_FORMS = [
  { id: "140821da-28b0-4e89-9b59-fd4cdc03a63a", label: "Newsletter signup (Join page)" },
  { id: "e67d9117-b213-439f-93bf-c6df04b26b18", label: "Mentor and volunteer interest" },
  { id: "50cd51ba-cfa4-4328-8bd2-64189dbe2790", label: "Sponsor and donation inquiry" },
  { id: "86585766-9ba9-499f-8dc6-0c097cbd531f", label: "Summer camp interest" },
  { id: "78b5bc3a-0521-4779-878c-179a4e9f4822", label: "Contact form" },
] as const;

export type SignupFormId = (typeof SIGNUP_FORMS)[number]["id"];

export function isSignupFormId(value: unknown): value is SignupFormId {
  return SIGNUP_FORMS.some((f) => f.id === value);
}

export interface Signup {
  id: string;
  name: string;
  email: string;
  /** ISO date-time the form was sent. */
  submittedAt: string;
  /** Every other answer, as readable text, for the details column. */
  details: Record<string, string>;
}

export interface SignupReader {
  /** Newest first. `since` limits it to signups on or after that date. */
  list(formId: SignupFormId, since?: Date): Promise<Signup[]>;
}

// ---------------------------------------------------------------------------------------------------------
// Turning a Wix submission into a Signup
// ---------------------------------------------------------------------------------------------------------

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NAME_KEY = /(^|_)(first_name|last_name|full_name|name)(_|$)/i;
const NOT_A_PERSON = /company|organization|org_|business/i;

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return "";
  return String(value).trim();
}

/** "interests_e5a6" -> "Interests" (drops Wix's random suffix). */
export function fieldLabel(key: string): string {
  const words = key.replace(/_[a-z0-9]{4}$/i, "").replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function toSignup(submission: { id?: string; createdDate?: string; submissions?: Record<string, unknown> }): Signup {
  const answers = submission.submissions ?? {};
  let email = "";
  const names: string[] = [];
  const details: Record<string, string> = {};
  for (const [key, value] of Object.entries(answers)) {
    const t = text(value);
    if (!t) continue;
    if (!email && EMAIL.test(t)) email = t;
    else if (NAME_KEY.test(key) && !NOT_A_PERSON.test(key)) names.push(t);
    else details[fieldLabel(key)] = t;
  }
  return { id: submission.id ?? "", name: names.join(" "), email, submittedAt: submission.createdDate ?? "", details };
}

/** Each email once (case-insensitive, first spelling kept), in list order. Blank emails are skipped. */
export function uniqueEmails(signups: Signup[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of signups) {
    const key = s.email.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s.email);
  }
  return out;
}

/** What "Copy all emails" puts on the clipboard: ready to paste into the To or Bcc line of an existing email. */
export function emailListText(signups: Signup[]): string {
  return uniqueEmails(signups).join(", ");
}

// ---------------------------------------------------------------------------------------------------------
// Reading from Wix (server only)
// ---------------------------------------------------------------------------------------------------------

const QUERY_URL = "https://www.wixapis.com/form-submission-service/v4/submissions/namespace/query";
const MAX_SIGNUPS = 2000; // 20 pages of 100; far more than a season's signups

export class WixSignupReader implements SignupReader {
  private readonly doFetch: typeof fetch;

  /** `apiKey` needs the "Manage form submissions" permission. Never send it to the browser. */
  constructor(
    private readonly apiKey: string,
    private readonly siteId: string,
    doFetch: typeof fetch = (...a) => fetch(...a),
  ) {
    this.doFetch = doFetch;
  }

  async list(formId: SignupFormId, since?: Date): Promise<Signup[]> {
    const out: Signup[] = [];
    let cursor: string | undefined;
    do {
      const filter: Record<string, unknown> = { namespace: "wix.form_app.form", formId };
      if (since) filter.createdDate = { $gte: since.toISOString() };
      const query = { filter, sort: [{ fieldName: "createdDate", order: "DESC" }], cursorPaging: { limit: 100, ...(cursor ? { cursor } : {}) } };
      let res: Response;
      try {
        res = await this.doFetch(QUERY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: this.apiKey, "wix-site-id": this.siteId },
          body: JSON.stringify({ query }),
        });
      } catch {
        throw new SiteError("wix-unavailable", "Couldn't reach Wix to read the form signups. Try again.");
      }
      if (res.status === 401 || res.status === 403) throw new SiteError("not-configured", "Wix refused the server's API key for form signups. Check SITE_MANAGER_WIX_API_KEY.");
      if (!res.ok) throw new SiteError("wix-unavailable", `Wix couldn't list the form signups (${res.status}). Try again.`);
      const data = (await res.json()) as { submissions?: Parameters<typeof toSignup>[0][]; metadata?: { hasNext?: boolean; cursors?: { next?: string } } };
      for (const s of data.submissions ?? []) out.push(toSignup(s));
      cursor = data.metadata?.hasNext ? data.metadata.cursors?.next : undefined;
    } while (cursor && out.length < MAX_SIGNUPS);
    return out;
  }
}

/** The server's variables for reading signups. Secrets: never commit or log them. */
export interface SignupEnv {
  SITE_MANAGER_WIX_API_KEY?: string;
  WIX_SITE_ID?: string;
}

/** Null when the server has no key: the Site Manager then says signups aren't set up yet. */
export function signupReaderFromEnv(env: SignupEnv, doFetch?: typeof fetch): WixSignupReader | null {
  if (!env.SITE_MANAGER_WIX_API_KEY || !env.WIX_SITE_ID) return null;
  return new WixSignupReader(env.SITE_MANAGER_WIX_API_KEY, env.WIX_SITE_ID, doFetch);
}

// ---------------------------------------------------------------------------------------------------------
// Demo data (demo mode and tests): made-up people only
// ---------------------------------------------------------------------------------------------------------

const DEMO: Record<SignupFormId, Omit<Signup, "id">[]> = {
  "140821da-28b0-4e89-9b59-fd4cdc03a63a": [
    { name: "Alex Griffin", email: "alex.griffin@example.com", submittedAt: "2026-11-10T18:04:00Z", details: { Grade: "8th", "Is parent": "No", Interests: "Programming, Design" } },
    { name: "Jordan Lee", email: "jordan.parent@example.com", submittedAt: "2026-11-02T01:30:00Z", details: { Grade: "9th", "Is parent": "Yes" } },
    { name: "Sam Rivera", email: "sam.rivera@example.com", submittedAt: "2026-10-21T22:15:00Z", details: { Grade: "10th", "Is parent": "No", Interests: "Business" } },
    { name: "Alex Griffin", email: "Alex.Griffin@example.com", submittedAt: "2026-09-12T16:40:00Z", details: { Grade: "8th", "Is parent": "No" } },
  ],
  "e67d9117-b213-439f-93bf-c6df04b26b18": [
    { name: "Pat Morgan", email: "pat.morgan@example.com", submittedAt: "2026-11-08T20:00:00Z", details: { Role: "Industry mentor", Message: "Mechanical engineer, free on Saturdays." } },
  ],
  "50cd51ba-cfa4-4328-8bd2-64189dbe2790": [
    { name: "Chris Park", email: "chris@example.com", submittedAt: "2026-10-30T17:20:00Z", details: { Company: "Example Machining", Message: "Interested in an Eagle sponsorship." } },
  ],
  "86585766-9ba9-499f-8dc6-0c097cbd531f": [],
  "78b5bc3a-0521-4779-878c-179a4e9f4822": [],
};

export class DemoSignupReader implements SignupReader {
  async list(formId: SignupFormId, since?: Date): Promise<Signup[]> {
    return DEMO[formId]
      .map((s, i) => ({ ...s, id: `demo-${i + 1}` }))
      .filter((s) => !since || new Date(s.submittedAt) >= since);
  }
}
