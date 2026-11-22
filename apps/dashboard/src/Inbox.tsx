// The inbox on Home: every notification you got, newest first (Discord and push are copies of these). Clicking one
// opens the right page and marks it read. The number of unread ones shows next to Home in the menu.
import { useEffect, useState } from "react";
import { notifications, type InboxItem } from "@team6220/data";
import { Btn, Section, frame } from "@team6220/ui";

const SHOWN = 5;

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function Inbox() {
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    notifications.myInbox().then((r) => setItems(r.items), () => setItems([]));
  }, []);
  const unread = items?.filter((i) => !i.readAt).length ?? 0;
  useEffect(() => {
    frame().setCount?.("", unread ? String(unread) : null);
  }, [unread]);

  if (!items || !items.length) return null;
  const readNow = (ids: string[] | "all") => {
    const now = new Date().toISOString();
    setItems(items.map((i) => (ids === "all" || ids.includes(i._id) ? { ...i, readAt: i.readAt || now } : i)));
    return notifications.markRead(ids).catch(() => undefined);
  };
  const open = async (item: InboxItem) => {
    if (!item.readAt) await readNow([item._id]);
    if (item.url) location.assign(item.url);
  };
  const shown = all ? items : items.slice(0, SHOWN);

  return (
    <Section
      title={unread ? `Inbox · ${unread} new` : "Inbox"}
      right={unread > 0 ? <Btn small icon="done" title="Mark all read" onClick={() => readNow("all")}>Mark all read</Btn> : undefined}
    >
      <ul className="k-box dash-inbox">
        {shown.map((item) => (
          <li key={item._id}>
            <button type="button" className={`dash-inbox-item${item.readAt ? "" : " is-new"}`} onClick={() => open(item)}>
              <span className="dash-inbox-dot" aria-label={item.readAt ? undefined : "New"} />
              <span className="dash-inbox-main">
                <span className="dash-inbox-title">{item.title}</span>
                {item.text && <span className="dash-inbox-text">{item.text}</span>}
              </span>
              <span className="dash-inbox-when">{ago(item.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>
      {items.length > SHOWN && <div><Btn small onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all (${items.length})`}</Btn></div>}
    </Section>
  );
}
