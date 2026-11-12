// A team icon in a React app. The drawings are the shared set in packages/assets/scripts/icons.js, which AppLayout
// loads on every app page; until it has loaded (or outside the browser) nothing is drawn.
// Size it with the t-icon classes in packages/ui/src/app.css (t-icon--inline matches the text around it).
declare global {
  interface Window {
    team6220Icons?: { paths(name: string): string };
  }
}

export function Icon({ name, inline = false }: { name: string; inline?: boolean }) {
  const paths = typeof window === "undefined" ? "" : (window.team6220Icons?.paths(name) ?? "");
  return (
    <svg
      className={inline ? "t-icon t-icon--inline" : "t-icon"}
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
}
