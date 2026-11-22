// /apps, /apps/all and /apps/account: Home, All apps and Account and settings (the Home app in the shared frame).
// Who you are decides what you see: signed out, signed in without badges yet (finish your profile), or a member.
import { useEffect, useState } from "react";
import { account, auth, BADGES, ops, type Member } from "@team6220/data";
import { frame, Screen } from "@team6220/ui";
import { Home } from "./Home";
import { AllApps } from "./AllApps";
import { Account } from "./Account";
import { SignedOut, Pending } from "./Welcome";

export type DashScreen = "home" | "all" | "account";

export type DashView =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "pending"; member: Member }
  | { kind: "approved"; member: Member; isWebAdmin: boolean }
  | { kind: "guest"; member: Member }
  | { kind: "error"; message: string };

const PULLED_KEY = "team6220.frame.pulled";

/** Once per browser session, the frame settings saved on the server replace this browser's, so they follow the account. */
function pullPrefs() {
  try {
    if (sessionStorage.getItem(PULLED_KEY)) return;
    sessionStorage.setItem(PULLED_KEY, "1");
  } catch {
    // no session storage: pull every time
  }
  account.getAccount().then((a) => { if (a.prefs) frame().setPrefs?.(a.prefs as never); }, () => {});
}

export default function Dashboard({ screen = "home" }: { screen?: DashScreen }) {
  const [view, setView] = useState<DashView>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Demo mode (?demo=lead and friends): the made-up member, so every screen can be tried without signing in.
        if (ops.isChosenDemo()) {
          const viewer = await ops.getViewer();
          if (viewer.kind === "member") return setView({ kind: "approved", member: { id: viewer.me.id, name: viewer.me.name, status: "APPROVED" } as Member, isWebAdmin: false });
          return setView({ kind: "signed-out" });
        }
        const member = await auth.getMember();
        if (!member) return setView({ kind: "signed-out" });
        const access = await auth.getAccess();
        if (access === "approved") {
          const isWebAdmin = await auth.hasBadge(BADGES.webAdmin).catch(() => false);
          pullPrefs();
          return setView({ kind: "approved", member, isWebAdmin });
        }
        // Cosmetic: a guest has the Guest badge but not Team Member. The apps and servers check for real.
        const guest = await auth.hasBadge(BADGES.guest).catch(() => false);
        setView(guest ? { kind: "guest", member } : { kind: "pending", member });
      } catch (err) {
        console.warn("Couldn't load the signed-in member", err);
        if (!cancelled) setView({ kind: "error", message: "We couldn't reach the team login service. Try again in a minute." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (view.kind === "loading") return <Screen><p className="k-hint" role="status">Checking sign-in…</p></Screen>;
  if (view.kind === "signed-out" || view.kind === "error") return <SignedOut error={view.kind === "error" ? view.message : undefined} />;
  if (view.kind === "pending") return <Pending member={view.member} />;
  if (screen === "account") return <Account member={view.member} />;
  if (screen === "all") return <AllApps view={view} />;
  return <Home view={view} />;
}
