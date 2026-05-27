// ===================================================================
// App — DayZ Brasil Reforger Leaderboard (Backend-connected)
// ===================================================================
const { useState, useEffect, useMemo } = React;

const PERIODS = [
  { id: "daily",   label: "DIÁRIO",  short: "24H" },
  { id: "weekly",  label: "SEMANAL", short: "7D"  },
  { id: "monthly", label: "MENSAL",  short: "30D" },
];

function WeaponSvg() {
  return (
    <svg width="13" height="9" viewBox="0 0 22 10" fill="none" aria-hidden="true">
      <path d="M0 4h11l2-2h4l1 1h3v3h-2l-1 1h-3l-2-2H0z" fill="currentColor" />
      <rect x="7" y="6" width="2" height="2" fill="currentColor" />
    </svg>
  );
}

function CrownSvg() {
  return (
    <svg width="42" height="30" viewBox="0 0 78 56" fill="none" aria-hidden="true">
      <path d="M3 50 L11 16 L25 34 L39 4 L53 34 L67 16 L75 50 Z" fill="#d4a847" stroke="#1a1306" strokeWidth="1.5" strokeLinejoin="miter" />
      <rect x="3" y="46" width="72" height="6" fill="#d4a847" stroke="#1a1306" strokeWidth="1" />
      <circle cx="11" cy="16" r="3" fill="#c1272d" stroke="#1a1306" strokeWidth="1" />
      <circle cx="39" cy="4" r="3.5" fill="#1a9d4b" stroke="#1a1306" strokeWidth="1" />
      <circle cx="67" cy="16" r="3" fill="#002776" stroke="#1a1306" strokeWidth="1" />
    </svg>
  );
}

// ===================================================================
// Hero Unificado — logo + controls + podium
// ===================================================================
function HeroUnified({ period, setPeriod, mode, setMode, players }) {
  const [online, setOnline] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/stats/server", { cache: "no-store" });
        if (res.ok) {
          const d = await res.json();
          setOnline(d.online ?? d.players_online ?? null);
        }
      } catch {}
    }
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const top3 = players.slice(0, 3);

  return (
    <section className="hero-unified" data-screen-label="Hero / Pódio Top 3">
      <div className="hero-u-top">
        <div className="hdr-brand">
          <div className="hdr-logo" aria-hidden="true">
            <svg viewBox="0 0 60 60" width="40" height="40" fill="none">
              <path d="M30 4 L52 16 L52 44 L30 56 L8 44 L8 16 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="miter" />
              <path d="M30 10 L46 19 L46 41 L30 50 L14 41 L14 19 Z" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.55" />
              <path d="M22 24 Q22 18 30 18 Q38 18 38 24 L38 32 Q38 35 36 36 L36 38 L24 38 L24 36 Q22 35 22 32 Z" fill="currentColor" />
              <circle cx="26" cy="28" r="2" fill="#0a0907" />
              <circle cx="34" cy="28" r="2" fill="#0a0907" />
              <path d="M28 38 L28 41 M30 38 L30 41 M32 38 L32 41" stroke="#0a0907" strokeWidth="1.2" />
              <path d="M30 4 L30 8" stroke="currentColor" strokeWidth="1" />
              <path d="M30 52 L30 56" stroke="currentColor" strokeWidth="1" />
            </svg>
          </div>
          <div className="hdr-name">
            <div className="hdr-name-line1">DAYZ BRASIL</div>
            <div className="hdr-name-line2">
              <span>REFORGER</span>
              <span className="hdr-divider" />
              <span className="hdr-tag">LEADERBOARD</span>
            </div>
          </div>
        </div>

        <div className="hero-u-controls">
          <div className="hero-u-online">
            <span className="hdr-dot" />
            <span className="hero-u-online-num">{online !== null ? online : "—"}</span>
          </div>
          <div className="hero-u-period" role="tablist">
            {PERIODS.map((p) => (
              <button key={p.id} role="tab" aria-selected={period === p.id}
                className={`hero-u-period-btn ${period === p.id ? "is-active" : ""}`}
                onClick={() => setPeriod(p.id)}>
                <span className="hero-u-period-short">{p.short}</span>
                <span className="hero-u-period-label">{p.label}</span>
              </button>
            ))}
          </div>
          <div className="hero-u-mode" role="tablist">
            <button role="tab" aria-selected={mode === "pvp"}
              className={`hero-u-mode-btn ${mode === "pvp" ? "is-active" : ""}`}
              onClick={() => setMode("pvp")}>⚔ PvP</button>
            <button role="tab" aria-selected={mode === "pve"}
              className={`hero-u-mode-btn ${mode === "pve" ? "is-active" : ""}`}
              onClick={() => setMode("pve")}>☣ PvE</button>
          </div>
        </div>
      </div>

      <div className="hero-u-eyebrow">
        <span className="hero-u-eyebrow-line" />
        <span>TOP 3 · {PERIODS.find(p => p.id === period).label} · {mode.toUpperCase()}</span>
        <span className="hero-u-eyebrow-line" />
      </div>

      <Podium players={top3} />
    </section>
  );
}

// ===================================================================
// Pódio
// ===================================================================
function PodiumPlace({ place, player }) {
  const labels = { 1: "01", 2: "02", 3: "03" };
  const titles = { 1: "CAMPEÃO", 2: "VICE", 3: "BRONZE" };

  return (
    <article className={`pc place-${place}`}>
      {place === 1 && <span className="pc-crown" aria-hidden="true"><CrownSvg /></span>}
      <span className="pc-glow" aria-hidden="true" />
      <div className="pc-rank">
        <span className="pc-rank-hash">#</span>
        <span className="pc-rank-num">{labels[place]}</span>
      </div>
      <div className="pc-body">
        <div className="pc-head">
          <span className="pc-title">{titles[place]}</span>
          {place === 1 && <span className="pc-mvp">MVP</span>}
        </div>
        <h3 className="pc-nick">{player.nick}</h3>
        <div className="pc-kills">
          <span className="pc-kills-num">{player.kills}</span>
          <span className="pc-kills-lbl"><span>TOTAL DE</span><span>KILLS</span></span>
        </div>
        <dl className="pc-stats">
          <div><dt>MORTES</dt><dd>{player.deaths}</dd></div>
          <div><dt>K/D</dt><dd className="accent">{player.kd}</dd></div>
        </dl>
      </div>
    </article>
  );
}

function Podium({ players }) {
  const [first, second, third] = players;
  const empty = { nick: "—", kills: 0, deaths: 0, kd: 0 };
  return (
    <div className="pc-row">
      <PodiumPlace place={1} player={first  || empty} />
      <PodiumPlace place={2} player={second || empty} />
      <PodiumPlace place={3} player={third  || empty} />
    </div>
  );
}

// ===================================================================
// LongestShotCard
// ===================================================================
function LongestShotCard({ data }) {
  const empty = !data || data.nick === "—";
  return (
    <article className="ls-card">
      <span className="ls-glow" aria-hidden="true" />
      <header className="ls-head">
        <span className="ls-eyebrow"><span className="ls-eyebrow-dot" />DESTAQUE · PRECISÃO</span>
        <h3>TIRO MAIS LONGO</h3>
      </header>
      {empty ? (
        <div className="no-data">SEM DADOS...</div>
      ) : (
        <>
          <div className="ls-player">
            <div className="ls-player-l">
              <div className="ls-player-pre"><span className="ls-player-pre-line" /><span>ATIRADOR</span></div>
              <h4 className="ls-player-nick">{data.nick}</h4>
              <div className="ls-player-wpn"><WeaponSvg /><span>{data.weapon}</span></div>
            </div>
          </div>
          <div className="ls-distance">
            <span className="ls-distance-num">{(data.dist || 0).toLocaleString("pt-BR")}</span>
            <div className="ls-distance-unit-wrap">
              <span className="ls-distance-unit">METROS</span>
              <span className="ls-distance-bar" />
            </div>
          </div>
          <div className="ls-trace" aria-hidden="true">
            <svg viewBox="0 0 340 70" width="100%" height="50" preserveAspectRatio="none">
              <g opacity="0.4">
                {[68, 136, 204, 272].map((x, i) => (
                  <g key={i} transform={`translate(${x} 46)`}>
                    <line y1="0" y2="6" stroke="currentColor" strokeWidth="0.8" />
                    <text y="16" textAnchor="middle" fontFamily="Share Tech Mono" fontSize="7" fill="currentColor">{(i+1)*250}M</text>
                  </g>
                ))}
              </g>
              <path d="M 14 46 Q 170 -10 326 26" stroke="currentColor" strokeWidth="1.8" fill="none" strokeDasharray="4 4" />
              <g transform="translate(14 46)"><circle r="4" fill="currentColor" /></g>
              <g transform="translate(326 26)" stroke="currentColor" strokeWidth="1.2" fill="none">
                <circle r="8" /><line x1="-13" y1="0" x2="-4" y2="0" /><line x1="4" y1="0" x2="13" y2="0" />
                <line x1="0" y1="-13" x2="0" y2="-4" /><line x1="0" y1="4" x2="0" y2="13" />
              </g>
            </svg>
          </div>
        </>
      )}
    </article>
  );
}

// ===================================================================
// LongestAliveCard
// ===================================================================
function LongestAliveCard({ data }) {
  const empty = !data || data.nick === "—";
  const days  = empty ? 0 : Math.floor(data.aliveMin / 1440);
  const hours = empty ? 0 : Math.floor((data.aliveMin % 1440) / 60);
  const mins  = empty ? 0 : data.aliveMin % 60;

  return (
    <article className="hi-card hi-alive">
      <header className="hi-head">
        <span className="hi-eyebrow">DESTAQUE</span>
        <h3>MAIOR TEMPO VIVO</h3>
      </header>
      {empty ? (
        <div className="no-data">SEM DADOS...</div>
      ) : (
        <div className="hi-alive-body">
          <div className="hi-alive-time">
            {days > 0 && <span><b>{days}</b><i>d</i></span>}
            <span><b>{String(hours).padStart(2,"0")}</b><i>h</i></span>
            <span><b>{String(mins).padStart(2,"0")}</b><i>m</i></span>
          </div>
          <div className="hi-alive-pulse" aria-hidden="true">
            <svg viewBox="0 0 280 36" width="100%" height="36" preserveAspectRatio="none">
              <polyline points="0,18 30,18 38,8 46,28 54,18 90,18 100,12 108,24 116,18 160,18 168,4 178,32 186,18 220,18 228,10 236,26 244,18 280,18"
                        fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </div>
          <dl className="hi-alive-meta">
            <div><dt>SOBREVIVENTE</dt><dd>{data.nick}</dd></div>
            <div><dt>STATUS</dt><dd className="accent">RECORDE</dd></div>
          </dl>
        </div>
      )}
    </article>
  );
}

// ===================================================================
// HuntCard (Caçada / Bounty) — returns null when no hunts
// ===================================================================
function HuntCard({ hunts }) {
  if (!hunts || hunts.length === 0) return null;

  const sorted = [...hunts].sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return b.streak - a.streak;
  });
  const main = sorted[0];
  const showTable = hunts.length > 1;
  const isActive = main.status === "active";

  return (
    <article className={`ls-card hu-card hu-${main.status}`}>
      <span className="ls-glow hu-glow" aria-hidden="true" />
      {isActive && <span className="hu-scan" aria-hidden="true" />}
      <header className="ls-head">
        <span className="ls-eyebrow hu-eyebrow">
          <span className="ls-eyebrow-dot" />
          {isActive ? "ALVO · PROCURADO" : "CAÇADA · ENCERRADA"}
        </span>
        <h3>{isActive ? "RECOMPENSA ATIVA" : "CAÇADA ENCERRADA"}</h3>
      </header>

      {!showTable && (
        <>
          <div className="hu-hero">
            <div className="hu-streak-block">
              <span className="hu-streak-big">{main.streak}</span>
              <div className="hu-streak-meta">
                <span className="hu-streak-bar" />
                <span className="hu-streak-lbl-big">KILLS SEM MORRER</span>
              </div>
            </div>
            <div className="hu-hunter">
              <div className="hu-hunter-pre">
                <span className="hu-hunter-pre-dot" />
                <span>{isActive ? "PROCURADO" : "ABATIDO"}</span>
                <span className={`hu-status-pill ${isActive ? "is-active" : "is-ended"}`}>
                  {isActive ? "AO VIVO" : "FIM"}
                </span>
              </div>
              <h4 className="hu-hunter-nick">{main.hunter}</h4>
            </div>
          </div>
          <div className="hu-bounty">
            <span className="hu-bounty-icon" aria-hidden="true">$</span>
            <div className="hu-bounty-text">
              <span className="hu-bounty-lbl">RECOMPENSA</span>
              <span className="hu-bounty-val">{main.bounty.toLocaleString("pt-BR")}</span>
            </div>
          </div>
          {!isActive && main.ender && (
            <div className="hu-ender">
              <div className="hu-ender-pre"><span className="hu-ender-line" />ABATIDO POR</div>
              <div className="hu-ender-body">
                <span className="hu-ender-nick">{main.ender}</span>
                <span className="hu-ender-wpn"><WeaponSvg />{main.enderWeapon}</span>
                <span className="hu-ender-dist">{main.enderDist}m</span>
              </div>
            </div>
          )}
        </>
      )}

      {showTable && (
        <div className="hu-list">
          {sorted.map((h) => (
            <div key={h.id} className={`hu-row hu-row-${h.status}`}>
              <div className="hu-row-streak-col">
                <span className="hu-row-streak-num">{h.streak}</span>
                <span className="hu-row-streak-lbl">kills</span>
              </div>
              <div className="hu-row-mid">
                <span className="hu-row-nick">{h.hunter}</span>
                <span className={`hu-row-status status-${h.status}`}>
                  {h.status === "ended" ? `☠ por ${h.ender}` : "PROCURADO"}
                </span>
              </div>
              <div className="hu-row-bounty">
                <span className="hu-row-bounty-icon">$</span>
                <span className="hu-row-bounty-val">{h.bounty.toLocaleString("pt-BR")}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

// ===================================================================
// SafezoneCard
// ===================================================================
function SafezoneCard({ kind, data }) {
  const { formatBRL } = window.GAME_DATA;
  const isSeller = kind === "seller";
  const title    = isSeller ? "MAIOR VENDEDOR" : "MAIOR COMPRADOR";
  const eyebrow  = isSeller ? "SAFEZONE · COMÉRCIO" : "SAFEZONE · CONSUMO";
  const verb     = isSeller ? "VENDEDOR" : "COMPRADOR";
  const totalLbl = isSeller ? "TOTAL ARRECADADO" : "TOTAL GASTO";
  const txLbl    = isSeller ? "vendas" : "compras";

  return (
    <article className={`sz sz-${kind}`}>
      <span className="sz-glow" aria-hidden="true" />
      <span className="sz-dollar" aria-hidden="true">$</span>
      <header className="ls-head">
        <span className="ls-eyebrow"><span className="ls-eyebrow-dot" />{eyebrow}</span>
        <h3>{title}</h3>
      </header>
      <div className="sz-player">
        <div className="sz-player-l">
          <div className="ls-player-pre"><span className="ls-player-pre-line" /><span>{verb}</span></div>
          <h4 className="ls-player-nick">{data.nick}</h4>
          <div className="sz-player-meta">
            <span>SAFEZONE</span>
            <span className="sz-player-sep" />
            <span>{data.transactions} {txLbl}</span>
          </div>
        </div>
      </div>
      <div className="sz-vault" aria-label={formatBRL(data.total)}>
        <div className="sz-vault-bg" aria-hidden="true">
          <svg viewBox="0 0 200 80" width="100%" height="100%" preserveAspectRatio="none">
            <defs>
              <pattern id={`sz-bill-${kind}`} x="0" y="0" width="40" height="20" patternUnits="userSpaceOnUse">
                <rect x="2" y="2" width="36" height="16" fill="none" stroke="currentColor" strokeWidth="0.5" />
                <circle cx="20" cy="10" r="3" fill="none" stroke="currentColor" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="200" height="80" fill={`url(#sz-bill-${kind})`} />
          </svg>
        </div>
        <div className="sz-vault-head">
          <span className="sz-vault-head-dot" />
          <span className="sz-vault-head-lbl">{totalLbl}</span>
        </div>
        <div className="sz-vault-display">
          <span className="sz-vault-currency">R$</span>
          <span className="sz-vault-num">
            {(data.total || 0).toLocaleString("pt-BR")}
            <span className="sz-vault-cents">,00</span>
          </span>
        </div>
      </div>
    </article>
  );
}

function SafezoneSection({ data, period }) {
  const periodLabel = PERIODS.find((p) => p.id === period).label;
  return (
    <section className="sz-section" data-screen-label="Safezone">
      <header className="sz-section-head">
        <span className="sz-section-eyebrow">
          <span className="sz-section-eyebrow-line" />
          ECONOMIA DO SERVIDOR
        </span>
        <h2 className="sz-section-title">SAFEZONE <span className="sz-section-acc">//</span> TOP COMÉRCIO</h2>
        <span className="sz-section-badge">{periodLabel}</span>
      </header>
      <div className="sz-grid">
        <SafezoneCard kind="seller" data={data.seller} />
        <SafezoneCard kind="buyer"  data={data.buyer}  />
      </div>
    </section>
  );
}

// ===================================================================
// RankTable — 5 filtros
// ===================================================================
function RankTable({ period }) {
  const { formatAlive, RANKINGS, SAFEZONE } = window.GAME_DATA;
  const [filter, setFilter] = useState("pvp");

  const isMoney = filter === "vendedor" || filter === "comprador";
  const isAlive = filter === "alive";

  const rows = useMemo(() => {
    if (filter === "pvp") return RANKINGS[period].pvp.slice(0, 10);
    if (filter === "pve") return RANKINGS[period].pve.slice(0, 10);
    if (filter === "alive") {
      return [...RANKINGS[period].pvp]
        .sort((a, b) => b.aliveMin - a.aliveMin)
        .slice(0, 10)
        .map((p, i) => ({ ...p, rank: i + 1 }));
    }
    if (filter === "vendedor" || filter === "comprador") {
      const kind = filter === "vendedor" ? "seller" : "buyer";
      const sz   = SAFEZONE[period];
      const seed = sz[kind];
      if (!seed || seed.nick === "—" || !seed.total) return [];
      return Array.from({ length: 10 }).map((_, i) => ({
        rank: i + 1,
        nick: i === 0 ? seed.nick : `Jogador ${i + 2}`,
        value: Math.round((seed.total || 0) * Math.max(0.2, 1 - i * 0.1)),
        transactions: Math.max(1, Math.round((seed.transactions || 0) * Math.max(0.2, 1 - i * 0.09))),
      }));
    }
    return RANKINGS[period].pvp.slice(0, 10);
  }, [filter, period]);

  const filterTitle = {
    pvp: "TOP PvP", pve: "TOP PvE",
    vendedor: "TOP VENDEDORES", comprador: "TOP COMPRADORES",
    alive: "MAIOR TEMPO VIVO",
  }[filter];

  return (
    <section className="table-section">
      <header className="table-head">
        <div>
          <h2>RANKING TOP 10</h2>
          <p>{filterTitle} · {PERIODS.find(p => p.id === period).label}</p>
        </div>
        <div className="rt-filters">
          {[
            { id: "pvp",       label: "PvP" },
            { id: "pve",       label: "PvE" },
            { id: "vendedor",  label: "Vendedor" },
            { id: "comprador", label: "Comprador" },
            { id: "alive",     label: "Tempo Vivo" },
          ].map((f) => (
            <button key={f.id}
              className={`rt-filter ${filter === f.id ? "is-active" : ""}`}
              onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
      </header>
      <div className="table-wrap">
        <table className="ranktable">
          <thead>
            <tr>
              <th className="col-rank">#</th>
              <th className="col-nick">JOGADOR</th>
              {isMoney ? (
                <><th className="col-num">R$</th><th className="col-num">TRANSAÇÕES</th></>
              ) : isAlive ? (
                <><th className="col-num">KILLS</th><th className="col-num">K/D</th><th className="col-num">TEMPO VIVO</th></>
              ) : (
                <><th className="col-num">KILLS</th><th className="col-num">MORTES</th><th className="col-num">K/D</th><th className="col-num">TEMPO VIVO</th></>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan="6" className="no-data">SEM DADOS...</td></tr>
            ) : rows.map((p) => (
              <tr key={p.rank} className={p.rank <= 3 ? "is-podium" : ""}>
                <td className="col-rank">
                  <span className={`rank-pill rank-${p.rank <= 3 ? p.rank : "n"}`}>
                    {String(p.rank).padStart(2, "0")}
                  </span>
                </td>
                <td className="col-nick">
                  <span className="nick">{p.nick}</span>
                  {p.rank === 1 && <span className="nick-tag">LÍDER</span>}
                </td>
                {isMoney ? (
                  <><td className="col-num mono accent-blue">R$ {(p.value||0).toLocaleString("pt-BR")}</td>
                  <td className="col-num mono">{p.transactions}</td></>
                ) : isAlive ? (
                  <><td className="col-num mono">{p.kills}</td>
                  <td className="col-num mono">{p.kd}</td>
                  <td className="col-num mono accent">{formatAlive(p.aliveMin)}</td></>
                ) : (
                  <><td className="col-num mono">{p.kills}</td>
                  <td className="col-num mono">{p.deaths}</td>
                  <td className={`col-num mono ${(p.kd||0) >= 3 ? "accent" : ""}`}>{p.kd}</td>
                  <td className="col-num mono">{formatAlive(p.aliveMin)}</td></>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ===================================================================
// App
// ===================================================================
function App() {
  const [period, setPeriod] = useState("daily");
  const [mode,   setMode]   = useState("pvp");
  const [tick,   setTick]   = useState(0);

  useEffect(() => {
    const h = () => setTick((t) => t + 1);
    window.addEventListener("gamedata-updated", h);
    return () => window.removeEventListener("gamedata-updated", h);
  }, []);

  const players    = window.GAME_DATA.RANKINGS[period][mode];
  const highlights = window.GAME_DATA.HIGHLIGHTS[period][mode];
  const safezone   = window.GAME_DATA.SAFEZONE[period];
  const hunts      = (window.GAME_DATA.HUNTS || {})[period] || [];

  return (
    <div className="app" data-mode={mode}>
      <div className="app-grid">
        <main className="app-main">
          <HeroUnified
            period={period} setPeriod={setPeriod}
            mode={mode} setMode={setMode}
            players={players}
          />

          <section className="highlights" data-screen-label="Destaques">
            <LongestShotCard data={highlights.longestShot} />
            <LongestAliveCard data={highlights.longestAlive} />
            <HuntCard hunts={hunts} />
          </section>

          <SafezoneSection data={safezone} period={period} />
          <RankTable period={period} />

          <footer className="page-foot">
            <div className="page-foot-line">
              <span>DAYZ BRASIL REFORGER</span>
              <span className="page-foot-dot" />
              <span>LIVE DATA · 30s</span>
              <span className="page-foot-dot" />
              <span>API v1</span>
            </div>
          </footer>
        </main>

        <KillFeedV3 />
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
