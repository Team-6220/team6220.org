// Reading secrets on Wix hosting (https://github.com/Team-6220/team6220.org/wiki/History-Phase-2). Secrets live in the Wix dashboard's Secrets Manager, never in the
// repo or the browser, and are read here with elevated permissions (Wix's documented way for headless server code).
// Each read is one of the 20 outside calls a request may make, so read only the secrets an action needs.
import { auth } from "@wix/essentials";
import { secrets } from "@wix/secrets";

const getSecretValue = auth.elevate(secrets.getSecretValue);

/** The secret's value, or undefined when it isn't set (or Wix can't be reached). Never log the value. */
export async function readSecret(name: string): Promise<string | undefined> {
  try {
    const { value } = await getSecretValue(name);
    return value || undefined;
  } catch {
    return undefined;
  }
}

/** Several secrets at once, read in parallel. Missing ones are left out. */
export async function readSecrets<Name extends string>(names: readonly Name[]): Promise<Partial<Record<Name, string>>> {
  const values = await Promise.all(names.map((n) => readSecret(n)));
  const out: Partial<Record<Name, string>> = {};
  names.forEach((n, i) => {
    if (values[i]) out[n] = values[i];
  });
  return out;
}
