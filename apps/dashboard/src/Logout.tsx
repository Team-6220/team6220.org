import { useEffect } from "react";
import { auth } from "@team6220/data";

/** Mounted at /apps/logout so any page can link to sign-out. */
export default function Logout() {
  useEffect(() => {
    void auth.logout("/apps");
  }, []);
  return (
    <main className="dash">
      <p className="dash__status" role="status">
        Signing you out…
      </p>
    </main>
  );
}
