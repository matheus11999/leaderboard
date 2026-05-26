// ===================================================================
// Kill Feed v3 — Colapsável (oculto por padrão)
// Botão de expandir bem destacado com badge de novos eventos
// ===================================================================
const { useState, useEffect, useRef } = React;

function timeAgoLabel(min) {
  if (min < 1) return "AGORA";
  if (min < 60) return `${min}M`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}H${m}M` : `${h}H`;
}

function WeaponGlyph() {
  return (
    <svg width="12" height="9" viewBox="0 0 22 10" fill="none" aria-hidden="true">
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

function KFRow({ ev, isNew }) {
  return (
    <li className={`kf3-row ${ev.type} ${isNew ? "kf3-new" : ""}`}>
      <div className="kf3-rail" aria-hidden="true">
        <span className="kf3-rail-dot" />
        <span className="kf3-rail-line" />
      </div>
      <div className="kf3-body">
        <div className="kf3-tags">
          <span className="kf3-time">{timeAgoLabel(ev.minutesAgo)}</span>
          <span className={`kf3-tag ${ev.type}`}>{ev.type === "pve" ? "PvE" : "PvP"}</span>
          {ev.headshot && (
            <span className="kf3-hs"><HSGlyph /> HS</span>
          )}
        </div>
        <div className="kf3-line">
          <span className="kf3-killer">{ev.killer}</span>
          <span className="kf3-wpn">
            <WeaponGlyph />
            <span>{ev.weapon}</span>
          </span>
          <span className={`kf3-victim ${ev.type === "pve" ? "is-npc" : ""}`}>{ev.victim}</span>
        </div>
        <div className="kf3-foot">
          <span className="kf3-dist"><b>{ev.dist}</b><i>m</i></span>
          <span className="kf3-sep" />
          <span className="kf3-loc">{ev.location}</span>
        </div>
      </div>
    </li>
  );
}

function KillFeedV3() {
  const [events, setEvents] = useState(() => window.GAME_DATA.seedKillFeed());
  const [newId, setNewId] = useState(null);
  const [counter, setCounter] = useState(20);
  const [open, setOpen] = useState(false);          // colapsado por padrão
  const [unread, setUnread] = useState(0);          // novos eventos enquanto fechado

  // Refresh from live API whenever data.jsx finishes a refresh.
  useEffect(() => {
    const handler = () => {
      const fresh = window.GAME_DATA.seedKillFeed();
      setEvents((prev) => {
        const prevTopId = prev[0]?.id;
        const freshTopId = fresh[0]?.id;
        if (freshTopId && freshTopId !== prevTopId) {
          setNewId(freshTopId);
          setUnread((u) => u + Math.max(0, fresh.length - prev.length));
          setTimeout(() => setNewId(null), 1800);
        }
        return fresh;
      });
      setCounter(20);
    };
    window.addEventListener("gamedata-updated", handler);
    return () => window.removeEventListener("gamedata-updated", handler);
  }, []);

  // Local countdown so the "NEXT REFRESH IN Ns" UI keeps ticking between fetches.
  useEffect(() => {
    const t = setInterval(() => {
      setCounter((c) => (c <= 1 ? 20 : c - 1));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Ao abrir, zera o badge
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  // Esc fecha
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* TOGGLE — visível sempre, fixo na lateral direita */}
      <button
        type="button"
        className={`kf3-toggle ${open ? "is-open" : ""} ${unread > 0 ? "has-unread" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="kf3-panel"
        aria-label={open ? "Fechar kill feed" : "Abrir kill feed"}
      >
        <span className="kf3-toggle-pulse" aria-hidden="true" />
        <span className="kf3-toggle-inner">
          <span className="kf3-toggle-live">
            <span className="kf3-toggle-dot" />
            <span>AO VIVO</span>
          </span>
          <span className="kf3-toggle-title">
            KILL <em>FEED</em>
          </span>
          <span className="kf3-toggle-meta">
            <span className="kf3-toggle-count">{events.length}</span>
            <span className="kf3-toggle-count-lbl">EVENTOS AO VIVO</span>
          </span>
          <span className="kf3-toggle-arrow" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 3 L4 7 L9 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" />
            </svg>
          </span>
        </span>
        {unread > 0 && !open && (
          <span className="kf3-toggle-badge" aria-label={`${unread} novos eventos`}>
            +{unread > 99 ? "99" : unread}
          </span>
        )}
      </button>

      {/* Overlay clicável quando aberto (escurece o resto) */}
      {open && <div className="kf3-overlay" onClick={() => setOpen(false)} aria-hidden="true" />}

      {/* PAINEL */}
      <aside
        id="kf3-panel"
        className={`kf3 ${open ? "is-open" : "is-closed"}`}
        aria-label="Kill feed ao vivo"
        aria-hidden={!open}
      >
        <header className="kf3-hdr">
          <div className="kf3-hdr-top">
            <span className="kf3-live">
              <span className="kf3-live-dot" />
              <span>AO VIVO</span>
            </span>
            <div className="kf3-hdr-right">
              <span className="kf3-counter">
                <span className="kf3-counter-pre">PRÓX</span>
                <span className="kf3-counter-num">{String(counter).padStart(2, "0")}</span>
                <span className="kf3-counter-unit">s</span>
              </span>
              <button className="kf3-close" onClick={() => setOpen(false)} aria-label="Fechar">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
                </svg>
              </button>
            </div>
          </div>
          <h2 className="kf3-title">
            KILL FEED <span className="kf3-title-acc">//</span>
          </h2>
          <div className="kf3-sub">
            <span>FEED EM TEMPO REAL</span>
            <span className="kf3-sub-sep" />
            <span>{events.length} EVENTOS</span>
          </div>
        </header>

        <ul className="kf3-list">
          {events.map((ev) => (
            <KFRow key={ev.id} ev={ev} isNew={ev.id === newId} />
          ))}
        </ul>

        <footer className="kf3-foot-bar">
          <span className="kf3-foot-l">
            <span className="kf3-foot-dot" />
            BR-01 / CHANNEL.LIVE
          </span>
          <span className="kf3-foot-r">v1.2.3</span>
        </footer>
      </aside>
    </>
  );
}

window.KillFeedV3 = KillFeedV3;
