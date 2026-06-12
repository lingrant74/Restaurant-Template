import { useMemo, useState } from "react";

export default function OnlineMenuLink({ restaurant, compact = false }) {
  const [message, setMessage] = useState("");
  const menuUrl = useMemo(() => {
    if (!restaurant?.slug) {
      return "";
    }

    return `${window.location.origin}/r/${restaurant.slug}`;
  }, [restaurant]);

  async function copyMenuLink() {
    if (!menuUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(menuUrl);
      setMessage("Copied");
    } catch {
      setMessage("Copy failed");
    }
  }

  if (!menuUrl) {
    return null;
  }

  return (
    <section className={compact ? "online-menu-link online-menu-link-compact" : "online-menu-link"}>
      <div>
        <p className="eyebrow">Online Menu</p>
        <strong>{menuUrl}</strong>
      </div>

      <div className="online-menu-actions">
        <button type="button" onClick={copyMenuLink}>Copy Link</button>
        <a href={menuUrl} target="_blank" rel="noreferrer">Open Public Menu</a>
      </div>

      {message && <span>{message}</span>}
    </section>
  );
}
