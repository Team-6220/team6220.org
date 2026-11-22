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
  /** A picture you uploaded (otherwise the frame shows your Google picture). */
  photoUrl?: string;
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

/** Shrinks a picture to a 256px square (cropped to the middle) as a JPEG, so uploads stay small. */
export async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Your profile picture: send a picture from shrinkPhoto. Returns its address. */
export async function setPhoto(photo: string): Promise<string> {
  if (isDemo()) {
    demoAccount = { ...demoAccount, profile: { ...demoAccount.profile, photoUrl: photo } };
    return photo;
  }
  return (await callOps<{ photoUrl: string }>("setMyPhoto", { photo })).photoUrl;
}

/** Deletes your account for good (the sign-in, your badges and your settings). Sign out right after. */
export async function deleteMyAccount(): Promise<void> {
  if (isDemo()) return;
  await callOps("deleteMyAccount");
}
