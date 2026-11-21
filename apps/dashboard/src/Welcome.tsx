// Before you're a member: signed out (sign in, and the apps open to everyone), or signed in for the first time
// (finish your profile; students on the roster are approved straight away).
import { useState } from "react";
import { account, auth, type AccountRole, type Member } from "@team6220/data";
import { Btn, Cards, Field, Fields, Note, PageHeader, Screen, Section, type CardItem } from "@team6220/ui";
import { APPS } from "./apps";

const SUBTEAMS = ["Design", "Manufacturing", "Programming", "Electrical", "Operations"];

function publicCards(): CardItem[] {
  return APPS.filter((a) => a.access === "public" && a.status === "live").map((a) => ({
    key: a.id, title: a.name, icon: a.icon, href: a.href, pill: { label: "Public", tone: "gold" }, lines: [a.description],
  }));
}

function SignInButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <div><Btn kind="primary" disabled={busy} onClick={async () => {
        setBusy(true);
        setError("");
        try { await auth.login("/apps"); } catch (err) { setError(err instanceof Error ? err.message : "Couldn't start sign-in."); setBusy(false); }
      }}>Sign in with Google</Btn></div>
      {error && <p className="k-hint" role="alert">{error}</p>}
    </>
  );
}

export function SignedOut({ error }: { error?: string }) {
  return (
    <Screen>
      <PageHeader title="Team apps" sub="Los Al Robotics · FRC Team 6220" />
      {error && <Note tone="bad">{error}</Note>}
      <section className="k-box dash-signin">
        <h3>Sign in to use team apps</h3>
        <p>Team members, boosters, and supervisors sign in with Google. New accounts wait for a web admin to approve them, so sign in once and then ask a lead to approve you.</p>
        <SignInButton />
      </section>
      <Section title="Open to everyone"><Cards items={publicCards()} /></Section>
    </Screen>
  );
}

const ROLES: [AccountRole, string][] = [
  ["student", "Student on the team"], ["parent", "Parent or supervisor"], ["mentor", "Mentor"], ["booster", "Booster"],
  ["alumni", "Alumni"], ["guest", "Visiting guest"], ["public", "Just using the public apps (no approval needed)"],
];

export function Pending({ member }: { member: Member }) {
  const [role, setRole] = useState<AccountRole>("student");
  const [first, setFirst] = useState(member.name.split(" ")[0] ?? "");
  const [last, setLast] = useState(member.name.split(" ").slice(1).join(" "));
  const [studentId, setStudentId] = useState("");
  const [subteams, setSubteams] = useState<string[]>([]);
  const [discord, setDiscord] = useState("");
  const [github, setGithub] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ approved: boolean; message: string } | null>(null);
  const [error, setError] = useState("");
  const student = role === "student";
  const ready = first.trim() && last.trim() && (!student || (/^\d{6,12}$/.test(studentId.trim()) && discord.trim()));

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await account.finishProfile({ role, firstName: first.trim(), lastName: last.trim(), studentId: student ? studentId.trim() : undefined, subteams: student ? subteams : undefined, discordName: discord.trim() || undefined, githubLogin: github.trim() || undefined });
      setResult(r);
      if (r.approved) setTimeout(() => location.assign("/apps"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <PageHeader title="Your account is pending approval" sub="Signed in with Google" />
      <Note tone="warn">Your account is waiting to be approved: a lead approves students, a booster approves supervisors, and a web admin approves anyone. Until then you can use the apps that are open to everyone. If that is all you want, pick "Just using the public apps" below and you are done.</Note>
      <Section title="Finish your profile">
        <div className="k-box k-form">
          <Fields cols={2}>
            <Field label="I am a">
              <select className="k-input" value={role} onChange={(e) => setRole(e.target.value as AccountRole)}>
                {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <span />
            <Field label="First name" hint="from your Google account"><input className="k-input" value={first} onChange={(e) => setFirst(e.target.value)} /></Field>
            <Field label="Last name" hint="from your Google account"><input className="k-input" value={last} onChange={(e) => setLast(e.target.value)} /></Field>
            {student && <Field label="Student ID" hint="your school ID, required for students"><input className="k-input" inputMode="numeric" value={studentId} onChange={(e) => setStudentId(e.target.value)} /></Field>}
            {student && (
              <div className="k-field k-field--wide">Subteam
                <div className="k-row" style={{ gap: "6px 16px", fontWeight: 400 }}>
                  {SUBTEAMS.map((s) => <label key={s} className="k-toggle"><input type="checkbox" checked={subteams.includes(s)} onChange={() => setSubteams(subteams.includes(s) ? subteams.filter((x) => x !== s) : subteams.concat([s]))} />{s}</label>)}
                </div>
              </div>
            )}
            {role !== "public" && <Field label="Discord username" hint={student ? "required" : "optional"}><input className="k-input" value={discord} onChange={(e) => setDiscord(e.target.value)} /></Field>}
            {role !== "public" && <Field label="GitHub username" hint="optional, only needed to sync a task with GitHub"><input className="k-input" value={github} onChange={(e) => setGithub(e.target.value)} /></Field>}
          </Fields>
          <div className="k-row"><Btn kind="primary" disabled={!ready || busy} title={!ready ? "Fill in the required boxes first" : undefined} onClick={submit}>{student ? "Check the roster" : "Save"}</Btn></div>
          {result && <Note tone={result.approved ? "ok" : undefined}>{result.message}</Note>}
          {error && <Note tone="bad">{error}</Note>}
        </div>
        <Note>Students: if your student ID and last name match the team roster, you are made a Member automatically and your grade is filled in from the roster. If they do not match, a web admin approves you by hand. Alumni are always approved by a web admin. The button stays off until the required boxes are filled in. Everyone else does not need a student ID, and Discord is optional for them. If you pick "Just using the public apps" there is no approval and no roster check; you keep an account for settings in apps like GoldSim.</Note>
      </Section>
      <Section title="Open to everyone"><Cards items={publicCards()} /></Section>
      <div><Btn href="/apps/logout">Sign out</Btn></div>
    </Screen>
  );
}
