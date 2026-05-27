// ===================================================================
// Kill Feed — Colapsável, atualiza a cada 10s via backend (no-cache)
// Design: post-apocalíptico v1 (kf-* classes)
// ===================================================================
const { useState, useEffect } = React;

function timeAgo(min) {
  if (min < 1) return "AGORA";
  if (min < 60) return `${min}M`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}H${m}M` : `${h}H`;
}

function WeaponGlyph() {
  return (
    <svg width="13" height="9" viewBox="0 0 22 10" fill="none" aria-hidden="true">
      <path d="M0 4h11l2-2h4l1 1h3v3h-2l-1 1h-3l-2-2H0z" fill="currentColor" />
      <rect x="7" y="6" width="2" height="2" fill="currentColor" />
    </svg>
  );
}

function HSGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1" fill="none" />
      <circle cx="5.5" cy="5.5" r="1.4" fill="currentColor" />
      <line x1="5.5" y1="0.4" x2="5.5" y2="2" stroke="currentColor" strokeWidth="0.9" />
      <line x1="5.5" y1="9" x2="5.5" y2="10.6" stroke="currentColor" strokeWidth="0.9" />
      <line x1="0.4" y1="5.5" x2="2" y2="5.5" stroke="currentColor" strokeWidth="0.9" />
      <line x1="9" y1="5.5" x2="10.6" y2="5.5" stroke="currentColor" strokeWidth="0.9" />
    </svg>
  );
}

function SuicideGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1" />
      <path d="M3.6 3.6l4.8 4.8M8.4 3.6L3.6 8.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function KFRow({ ev, isNew }) {
  const distTier =
    ev.dist >= 700 ? "extreme" :
    ev.dist >= 400 ? "long"    :
    ev.dist >= 150 ? "mid"     : "close";

  return (
    <li className={`kf-row ${ev.type} ${isNew ? "kf-new" : ""}`}>
      <div className="kf-rail" aria-hidden="true">
        <span className="kf-rail-dot" />
        <span className="kf-rail-line" />
      </div>
      <div className="kf-body">
        <div className="kf-tags">
          <span className="kf-time">{timeAgo(ev.minutesAgo)}</span>
          <span className={`kf-tag ${ev.type}`}>{ev.isSuicide ? "SUICIDIO" : (ev.type === "pve" ? "PvE" : "PvP")}</span>
          {ev.dist > 0 && (
            <span className={`kf-dist-badge tier-${distTier}`}>
              <span className="kf-dist-icon" aria-hidden="true">
                <svg width="8" height="8" viewBox="0 0 9 9" fill="none">
                  <circle cx="4.5" cy="4.5" r="3.5" stroke="currentColor" strokeWidth="1" />
                  <circle cx="4.5" cy="4.5" r="1" fill="currentColor" />
                </svg>
              </span>
              <span className="kf-dist-num">{ev.dist}<i>m</i></span>
            </span>
          )}
          {ev.headshot && <span className="kf-hs"><HSGlyph /> HS</span>}
        </div>
        {ev.isSuicide ? (
          <div className="kf-line kf-line-suicide">
            <span className="kf-suicide-icon"><SuicideGlyph /></span>
            <span className="kf-killer">{ev.victim}</span>
            <span className="kf-suicide-text">se matou</span>
            {ev.weapon && ev.weapon !== "—" && (
              <span className="kf-wpn kf-wpn-muted">
                <WeaponGlyph />
                <span>{ev.weapon}</span>
              </span>
            )}
          </div>
        ) : (
          <div className="kf-line">
            <span className="kf-killer">{ev.killer}</span>
            <span className="kf-wpn">
              <WeaponGlyph />
              <span>{ev.weapon}</span>
            </span>
            <span className={`kf-victim ${ev.type === "pve" ? "is-npc" : ""}`}>{ev.victim}</span>
          </div>
        )}
      </div>
    </li>
  );
}

function KillFeedV3() {
  const [events, setEvents] = React.useState(() => window.GAME_DATA.seedKillFeed());
  const [newId, setNewId] = React.useState(null);
  const [counter, setCounter] = React.useState(10);
  const [open, setOpen] = React.useState(false);
  const [unread, setUnread] = React.useState(0);
  const [feedFilter, setFeedFilter] = React.useState("pvp");
  const filteredEvents = events.filter((ev) => ev.type === feedFilter);

  // React to kill feed refreshes from data.jsx (every 10s, no-cache)
  React.useEffect(() => {
    const handler = () => {
      const fresh = window.GAME_DATA.seedKillFeed();
      setEvents((prev) => {
        const prevFiltered = prev.filter((ev) => ev.type === feedFilter);
        const freshFiltered = fresh.filter((ev) => ev.type === feedFilter);
        const prevTopId = prevFiltered[0]?.id;
        const freshTopId = freshFiltered[0]?.id;
        if (freshTopId && freshTopId !== prevTopId) {
          setNewId(freshTopId);
          const newCount = freshFiltered.filter((f) => !prevFiltered.some((p) => p.id === f.id)).length;
          setUnread((u) => u + Math.max(1, newCount));
          setTimeout(() => setNewId(null), 1800);
        }
        return fresh;
      });
      setCounter(10);
    };
    window.addEventListener("killfeed-updated", handler);
    return () => window.removeEventListener("killfeed-updated", handler);
  }, [feedFilter]);

  // Countdown display
  React.useEffect(() => {
    const t = setInterval(() => {
      setCounter((c) => (c <= 1 ? 10 : c - 1));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Clear unread when opened
  React.useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  React.useEffect(() => {
    setNewId(null);
    if (open) setUnread(0);
  }, [feedFilter, open]);

  // Esc closes
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Toggle — sempre visível, fixo na lateral direita */}
      <button
        type="button"
        className={`kf-toggle ${open ? "is-open" : ""} ${unread > 0 ? "has-unread" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Fechar kill feed" : "Abrir kill feed"}
      >
        <span className="kf-toggle-inner">
          <span className="kf-toggle-live">
            <span className="kf-toggle-dot" />
            <span>AO VIVO</span>
          </span>
          <span className="kf-toggle-title">KILL <em>FEED</em></span>
          <span className="kf-toggle-arrow" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 3 L4 7 L9 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
            </svg>
          </span>
        </span>
        {unread > 0 && !open && (
          <span className="kf-toggle-badge">+{unread > 99 ? "99" : unread}</span>
        )}
      </button>

      {open && <div className="kf-overlay" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside className={`kf-panel ${open ? "is-open" : ""}`} aria-hidden={!open}>
        <header className="kf-hdr">
          <div className="kf-hdr-top">
            <span className="kf-live">
              <span className="kf-live-dot" />
              <span>AO VIVO</span>
            </span>
            <div className="kf-hdr-right">
              <span className="kf-counter">
                <span className="kf-counter-pre">PRÓX</span>
                <span className="kf-counter-num">{String(counter).padStart(2, "0")}</span>
                <span className="kf-counter-unit">s</span>
              </span>
              <button className="kf-close" onClick={() => setOpen(false)} aria-label="Fechar">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
                </svg>
              </button>
            </div>
          </div>
          <h2 className="kf-title">KILL FEED <span className="kf-title-acc">//</span></h2>
          <div className="kf-sub">
            <span>FEED EM TEMPO REAL · 10s</span>
            <span className="kf-sub-sep" />
            <span>{filteredEvents.length} EVENTOS</span>
          </div>
          <div className="kf-filter" role="group" aria-label="Filtro do kill feed">
            <button
              type="button"
              className={`kf-filter-btn ${feedFilter === "pvp" ? "is-active" : ""}`}
              onClick={() => setFeedFilter("pvp")}
            >
              PvP
            </button>
            <button
              type="button"
              className={`kf-filter-btn ${feedFilter === "pve" ? "is-active" : ""}`}
              onClick={() => setFeedFilter("pve")}
            >
              PvE
            </button>
          </div>
        </header>

        <ul className="kf-list">
          {filteredEvents.length === 0 ? (
            <li style={{ padding: "24px 18px", color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.14em" }}>
              SEM EVENTOS RECENTES...
            </li>
          ) : (
            filteredEvents.map((ev) => (
              <KFRow key={ev.id} ev={ev} isNew={ev.id === newId} />
            ))
          )}
        </ul>

        <footer className="kf-foot-bar">
          <span className="kf-foot-l">
            <span className="kf-foot-dot" />
            BR-01 · AO VIVO
          </span>
          <span>ATUALIZA A CADA 10S</span>
        </footer>
      </aside>
    </>
  );
}

window.KillFeedV3 = KillFeedV3;
