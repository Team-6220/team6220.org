// The note at the top of the public calendar, which is what anyone sees, signed in or not.
import { auth } from "@team6220/data";
import { Btn, Note } from "@team6220/ui";
import type { CalendarView } from "./Calendar";

export function PublicNote({ view }: { view: CalendarView }) {
  if (!view.visitor) return null;
  const waiting = view.visitor === "pending";
  return (
    <>
      <Note>
        {waiting ? "The team calendar opens once a web admin approves your account. Until then, this is what anyone sees: " : "This is what anyone sees, signed in or not: "}
        meeting dates and times, competitions, and other events. Supervision shifts, supervisors, and attendance are only for the team.
      </Note>
      {view.visitor === "signed-out" && <div><Btn kind="primary" onClick={() => auth.login(location.pathname + location.search)}>Sign in with Google</Btn></div>}
    </>
  );
}
