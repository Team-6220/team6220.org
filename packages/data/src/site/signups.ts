// Form signups for the Site Manager (#76): who filled out each website form, and their emails ready to paste into an
// existing email thread. Browser-safe; on the server, createSignupReader gets an elevated Wix query (no API key).
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

const MAX_SIGNUPS = 2000; // 20 pages of 100; far more than a season's signups

/** One page of Wix Forms submissions, in the shape of Wix's Query Submissions By Namespace (REST or SDK). */
export interface SubmissionsPage {
  submissions?: { _id?: string | null; id?: string | null; _createdDate?: Date | string | null; createdDate?: string | null; submissions?: Record<string, unknown> | null }[];
  metadata?: { hasNext?: boolean | null; cursors?: { next?: string | null } | null } | null;
}

/** Runs one query. On Wix hosting: the forms SDK's querySubmissionsByNamespace called with a query, elevated (no API key). */
export type QuerySubmissions = (query: Record<string, unknown>) => Promise<SubmissionsPage>;

/** Reads a form's submissions page by page through `query`, newest first. */
export function createSignupReader(query: QuerySubmissions): SignupReader {
  return {
    async list(formId, since) {
      const out: Signup[] = [];
      let cursor: string | undefined;
      do {
        const filter: Record<string, unknown> = { namespace: "wix.form_app.form", formId };
        if (since) filter._createdDate = { $gte: since.toISOString() };
        const q = cursor
          ? { cursorPaging: { limit: 100, cursor } }
          : { filter, sort: [{ fieldName: "_createdDate", order: "DESC" }], cursorPaging: { limit: 100 } };
        let page: SubmissionsPage;
        try {
          page = await query(q);
        } catch {
          throw new SiteError("wix-unavailable", "Couldn't read the form signups from Wix. Try again.");
        }
        for (const s of page.submissions ?? []) {
          const created = s._createdDate ?? s.createdDate;
          out.push(toSignup({ id: s._id ?? s.id ?? "", createdDate: created instanceof Date ? created.toISOString() : created ?? "", submissions: s.submissions ?? {} }));
        }
        cursor = page.metadata?.hasNext ? page.metadata.cursors?.next ?? undefined : undefined;
      } while (cursor && out.length < MAX_SIGNUPS);
      return out;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------
// Demo data (demo mode and tests): made-up people only
// ---------------------------------------------------------------------------------------------------------

const DEMO: Record<SignupFormId, Omit<Signup, "id">[]> = {
  "140821da-28b0-4e89-9b59-fd4cdc03a63a": [
    { name: "Alex Griffin", email: "alex.griffin@example.com", submittedAt: "2026-11-10T18:04:00Z", details: { Grade: "8th", "Is parent": "No", Interests: "Programming, Design" } },
    { name: "Jordan Lee", email: "jordan.parent@example.com", submittedAt: "2026-11-02T01:30:00Z", details: { Grade: "9th", "Is parent": "Yes" } },
    { name: "Sam Rivera", email: "sam.rivera@example.com", submittedAt: "2026-10-21T22:15:00Z", details: { Grade: "10th", "Is parent": "No", Interests: "Operations" } },
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
