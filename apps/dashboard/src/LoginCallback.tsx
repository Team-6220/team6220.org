import { useEffect, useState } from "react";
import { auth } from "@team6220/data";

/** Mounted at /apps/login/callback. Finishes the Wix login, then goes back where the member started. */
export default function LoginCallback() {
  const [error, setError] = useState<string>();

  useEffect(() => {
    auth
      .handleLoginCallback()
      .then((next) => window.location.replace(next))
      .catch((err: unknown) => {
        console.warn("Sign-in failed", err);
        setError(err instanceof Error ? err.message : "Sign-in failed.");
      });
  }, []);

  return (
    <main className="dash">
      {error ? (
        <div className="dash__panel" role="alert">
          <h1>Sign-in didn't finish</h1>
          <p>{error}</p>
          <p>
            If you just signed up, a web admin has to approve your account before you can sign in.
          </p>
          <a className="t-button" href="/apps">
            Back to team apps
          </a>
        </div>
      ) : (
        <p className="dash__status" role="status">
          Signing you in…
        </p>
      )}
    </main>
  );
}
