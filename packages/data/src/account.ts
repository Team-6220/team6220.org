// Your own account: your profile on the team (names, GitHub, Discord), your settings that follow you to every device
// (the frame's layout, pins, hidden apps, keybinds), and finishing your profile when you first sign in. Browser side;
// the server side is account.ts in ops/server. Demo mode keeps everything in memory.
import { callOps, isDemo } from "./ops";

export type Role = "student" | "parent" | "mentor" | "booster" | "alumni" | "guest" | "public";

export interface Profile {
  firstName: string;
  lastName: string;
  githubLogin: string;
  discordName: string;
  /** Students only, from the roster. */
  grade?: string;
  studentId?: string;
  /** The Google account you signed in with. */
  email?: string;
}

export interface AccountInfo {
  profile: Profile;
  /** The frame's settings saved on the server (null until saved once). */
  prefs: Record<string, unknown> | null;
}

let demoAccount: AccountInfo = {
  profile: { firstName: "Demo", lastName: "Lead", githubLogin: "demolead", discordName: "demolead", grade: "Junior", email: "demo.lead@example.com" },
  prefs: null,
};

export async function getAccount(): Promise<AccountInfo> {
  if (isDemo()) return structuredClone(demoAccount);
  const { profile, prefs } = await callOps<AccountInfo>("getAccount");
  return { profile, prefs };
}

export async function saveProfile(changes: Partial<Pick<Profile, "firstName" | "lastName" | "githubLogin" | "discordName">>): Promise<Profile> {
  if (isDemo()) {
    demoAccount = { ...demoAccount, profile: { ...demoAccount.profile, ...changes } };
    return structuredClone(demoAccount.profile);
  }
  return (await callOps<{ profile: Profile }>("saveMyProfile", { profile: changes })).profile;
}

/** Saves the frame's settings so they follow the account (called after each change, a moment later). */
export async function savePrefs(prefs: Record<string, unknown>): Promise<void> {
  if (isDemo()) {
    demoAccount = { ...demoAccount, prefs: structuredClone(prefs) };
    return;
  }
  await callOps("savePrefs", { prefs });
}

export interface ProfileForm {
  role: Role;
  firstName: string;
  lastName: string;
  studentId?: string;
  subteams?: string[];
  discordName?: string;
  githubLogin?: string;
}
/**
 * Finish your profile after first signing in. A student whose student ID and last name match the roster becomes a
 * Team Member straight away (with the grade from the roster); everyone else waits for a person to approve them.
 */
export async function finishProfile(form: ProfileForm): Promise<{ approved: boolean; message: string }> {
  if (isDemo()) return { approved: form.role === "student", message: form.role === "student" ? "You're on the roster. Welcome!" : "Thanks! A web admin will approve you soon." };
  return callOps<{ approved: boolean; message: string }>("finishProfile", { form });
}
