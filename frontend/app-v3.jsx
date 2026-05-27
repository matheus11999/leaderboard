// ===================================================================
// App — DayZ Brasil Reforger Leaderboard
// Design: post-apocalíptico v1 (classes do design bundle)
// ===================================================================
const { useState, useEffect, useMemo } = React;

const PERIODS = [
  { id: "daily",   label: "DIÁRIO",  short: "24H" },
  { id: "weekly",  label: "SEMANAL", short: "7D"  },
  { id: "monthly", label: "MENSAL",  short: "30D" },
];

// ===================================================================
// SVG helpers
// ===================================================================
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
      <path d="M3 50 L11 16 L25 34 L39 4 L53 34 L67 16 L75 50 Z"
            fill="#d4a847" stroke="#1a1306" strokeWidth="1.5" strokeLinejoin="miter" />
      <rect x="3" y="46" width="72" height="6" fill="#d4a847" stroke="#1a1306" strokeWidth="1" />
      <circle cx="11" cy="16" r="3" fill="#c1272d" stroke="#1a1306" strokeWidth="1" />
      <circle cx="39" cy="4" r="3.5" fill="#1a9d4b" stroke="#1a1306" strokeWidth="1" />
      <circle cx="67" cy="16" r="3" fill="#002776" stroke="#1a1306" strokeWidth="1" />
    </svg>
  );
}

// ===================================================================
// Hero Unificado (period + mode controls + online)
// ===================================================================
function HeroUnified({ period, setPeriod, mode, setMode }) {
  const [online, setOnline] = useState(null);

  // Fetch online count from stats endpoint
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/stats/server", { cache: "no-store" });
        if (res.ok) {
          const d = await res.json();
          setOnline(d.online ?? d.players_online ?? null);
        }
      } catch { /* ignore */ }
    }
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="hero-unified">
      {/* Controls row */}
      <div className="hero-u-top">
        {/* Branding */}
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 28, letterSpacing: "0.04em", color: "var(--text)", lineHeight: 1 }}>
            DAYZ BRASIL
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 13, letterSpacing: "0.24em", color: "var(--text-muted)", marginTop: 4 }}>
            REFORGER <span style={{ color: "var(--primary)" }}>// LEADERBOARD</span>
          </div>
        </div>

        <div className="hero-u-controls">
          {/* Online count */}
          {online !== null && (
            <div className="hero-u-online">
              <span className="hdr-dot" />
              <span className="hero-u-online-num">{online}</span>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 10, letterSpacing: "0.16em", color: "var(--text-dim)" }}>ONLINE</div>
              </div>
            </div>
          )}

          {/* Period tabs */}
          <div className="hero-u-period" role="tablist">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                role="tab"
                aria-selected={period === p.id}
                className={`hero-u-period-btn ${period === p.id ? "is-active" : ""}`}
                onClick={() => setPeriod(p.id)}
              >
                <span className="hero-u-period-short">{p.short}</span>
                <span className="hero-u-period-label">{p.label}</span>
              </button>
            ))}
          </div>

          {/* Mode toggle */}
          <div className="hero-u-mode" role="tablist">
            <button
              role="tab"
              aria-selected={mode === "pvp"}
              className={`hero-u-mode-btn ${mode === "pvp" ? "is-active" : ""}`}
              onClick={() => setMode("pvp")}
            >
              ⚔ PvP
            </button>
            <button
              role="tab"
              aria-selected={mode === "pve"}
              className={`hero-u-mode-btn ${mode === "pve" ? "is-active" : ""}`}
              onClick={() => setMode("pve")}
            >
              ☣ PvE
            </button>
          </div>
        </div>
      </div>

      {/* Eyebrow */}
      <div className="hero-u-eyebrow">
        <span className="hero-u-eyebrow-line" />
        TOP JOGADORES · {PERIODS.find((p) => p.id === period)?.label} · {mode === "pvp" ? "PvP" : "PvE"}
        <span className="hero-u-eyebrow-line" />
      </div>

      {/* Podium rendered as child */}
    </div>
  );
}

// ===================================================================
// Podium card (pc layout: rank left, body right)
// ===================================================================
function PodiumCard({ place, player }) {
  if (!player) {
    return (
      <article className={`pc place-${place}`}>
        <div className="pc-rank">
          <span className="pc-rank-hash">#</span>
          <span className="pc-rank-num">{String(place).padStart(2, "0")}</span>
        </div>
        <div className="pc-body">
          <div className="pc-head"><span className="pc-title">AGUARDANDO</span></div>
          <h3 className="pc-nick" style={{ color: "var(--text-dim)" }}>— — —</h3>
          <div className="pc-kills">
            <span className="pc-kills-num">0</span>
            <span className="pc-kills-lbl"><span>TOTAL DE</span><span>KILLS</span></span>
          </div>
          <dl className="pc-stats">
            <div><dt>MORTES</dt><dd>0</dd></div>
            <div><dt>K/D</dt><dd className="accent">—</dd></div>
          </dl>
        </div>
      </article>
    );
  }

  const titles = { 1: "CAMPEÃO", 2: "VICE", 3: "BRONZE" };

  return (
    <article className={`pc place-${place}`}>
      {place === 1 && (
        <span className="pc-crown" aria-hidden="true"><CrownSvg /></span>
      )}
      <span className="pc-glow" aria-hidden="true" />

      {/* Rank */}
      <div className="pc-rank">
        <span className="pc-rank-hash">#</span>
        <span className="pc-rank-num">{String(place).padStart(2, "0")}</span>
      </div>

      {/* Body */}
      <div className="pc-body">
        <div className="pc-head">
          <span className="pc-title">{titles[place]}</span>
          {place === 1 && <span className="pc-mvp">MVP</span>}
        </div>
        <h3 className="pc-nick">{player.nick}</h3>
        <div className="pc-kills">
          <span className="pc-kills-num">{player.kills.toLocaleString("pt-BR")}</span>
          <span className="pc-kills-lbl"><span>TOTAL DE</span><span>KILLS</span></span>
        </div>
        <dl className="pc-stats">
          <div>
            <dt>MORTES</dt>
            <dd>{player.deaths.toLocaleString("pt-BR")}</dd>
          </div>
          <div>
            <dt>K/D</dt>
            <dd className="accent">{player.kd}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

function Podium({ players }) {
  const [first, second, third] = players;
  return (
    <div className="pc-row">
      <PodiumCard place={1} player={first} />
      <PodiumCard place={2} player={second} />
      <PodiumCard place={3} player={third} />
    </div>
  );
}

// ===================================================================
// Highlight cards
// ===================================================================
function LongestShotCard({ data }) {
  const dist = data?.dist ?? 0;
  return (
    <article className="ls-card">
      <span className="ls-glow" aria-hidden="true" />
      <header className="ls-head">
        <span className="ls-eyebrow">
          <span className="ls-eyebrow-dot" />
          DESTAQUE · PRECISÃO
        </span>
        <h3>TIRO MAIS LONGO</h3>
      </header>

      <div className="ls-player">
        <div className="ls-player-l">
          <div className="ls-player-pre">
            <span className="ls-player-pre-line" />
            <span>ATIRADOR</span>
          </div>
          <h4 className="ls-player-nick">{data?.nick ?? "—"}</h4>
          {data?.weapon && data.weapon !== "—" && (
            <div className="ls-player-wpn">
              <WeaponSvg />
              <span>{data.weapon}</span>
            </div>
          )}
        </div>
      </div>

      <div className="ls-distance">
        <span className="ls-distance-num">{dist > 0 ? dist.toLocaleString("pt-BR") : "—"}</span>
        <div className="ls-distance-unit-wrap">
          <span className="ls-distance-unit">METROS</span>
          <span className="ls-distance-bar" />
        </div>
      </div>

      <div className="ls-trace" aria-hidden="true">
        <svg viewBox="0 0 340 70" width="100%" height="50" preserveAspectRatio="none">
          <g opacity="0.18">
            <path d="M0 60 Q 85 50 170 56 T 340 50" stroke="currentColor" strokeWidth="0.6" fill="none" />
          </g>
          <path d="M 14 46 Q 170 -10 326 26" stroke="currentColor" strokeWidth="1.8" fill="none" strokeDasharray="4 4" />
          <g transform="translate(14 46)">
            <circle r="4" fill="currentColor" />
            <circle r="9" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
          </g>
          <g transform="translate(326 26)" stroke="currentColor" strokeWidth="1.2" fill="none">
            <circle r="8" />
            <line x1="-13" y1="0" x2="-4" y2="0" />
            <line x1="4" y1="0" x2="13" y2="0" />
            <line x1="0" y1="-13" x2="0" y2="-4" />
            <line x1="0" y1="4" x2="0" y2="13" />
          </g>
        </svg>
      </div>
    </article>
  );
}

function LongestAliveCard({ data }) {
  const min = data?.aliveMin ?? 0;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return (
    <article className="hi-card hi-alive">
      <div className="hi-head">
        <span className="hi-eyebrow">DESTAQUE · SOBREVIVÊNCIA</span>
        <h3>MAIOR TEMPO VIVO</h3>
      </div>
      <div className="hi-alive-time">
        {h > 0 && (
          <span>
            <b>{h}</b>
            <i>h</i>
          </span>
        )}
        <span>
          <b>{m}</b>
          <i>min</i>
        </span>
      </div>
      <div className="hi-alive-pulse" aria-hidden="true">
        <svg viewBox="0 0 260 28" width="100%" height="28" preserveAspectRatio="none">
          <polyline
            points="0,14 30,14 42,4 54,24 66,14 90,14 102,8 114,20 126,14 150,14 162,2 174,26 186,14 210,14 222,10 234,18 246,14 260,14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      </div>
      <dl className="hi-alive-meta">
        <div>
          <dt>JOGADOR</dt>
          <dd>{data?.nick ?? "—"}</dd>
        </div>
        <div>
          <dt>TEMPO</dt>
          <dd>{min > 0 ? window.GAME_DATA.formatAlive(min) : "—"}</dd>
        </div>
      </dl>
    </article>
  );
}

// ===================================================================
// Ranking table (top 10)
// ===================================================================
function RankTable({ players, mode, period }) {
  const periodLabel = PERIODS.find((p) => p.id === period)?.label ?? period;

  return (
    <section className="table-section">
      <div className="table-head">
        <div>
          <h2>RANKING · JOGADORES</h2>
          <p>Top {players.length} · {periodLabel} · {mode === "pvp" ? "PvP" : "PvE"}</p>
        </div>
        <span className="table-mode-badge">{mode === "pvp" ? "PvP" : "PvE"}</span>
      </div>

      <div className="table-wrap">
        <table className="ranktable">
          <thead>
            <tr>
              <th className="col-rank">#</th>
              <th className="col-nick">JOGADOR</th>
              <th className="col-num">KILLS</th>
              <th className="col-num">MORTES</th>
              <th className="col-num">K/D</th>
              <th className="col-num">TEMPO VIVO</th>
            </tr>
          </thead>
          <tbody>
            {players.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: "center", padding: "32px", color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em" }}>
                  SEM DADOS — AGUARDANDO CONEXÃO COM API...
                </td>
              </tr>
            ) : (
              players.map((pl) => (
                <tr key={pl.uid ?? pl.nick}>
                  <td className="col-rank">
                    <span className={`rank-pill rank-${pl.rank}`}>
                      {pl.rank}
                    </span>
                  </td>
                  <td className="col-nick">
                    <span className="nick">{pl.nick}</span>
                    {pl.rank === 1 && <span className="nick-tag">MVP</span>}
                  </td>
                  <td className="col-num mono">{pl.kills.toLocaleString("pt-BR")}</td>
                  <td className="col-num mono">{pl.deaths.toLocaleString("pt-BR")}</td>
                  <td className="col-num mono" style={{ color: "var(--primary)" }}>{pl.kd}</td>
                  <td className="col-num mono">{pl.aliveMin > 0 ? window.GAME_DATA.formatAlive(pl.aliveMin) : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ===================================================================
// App root
// ===================================================================
function App() {
  const [period, setPeriod] = useState("daily");
  const [mode, setMode] = useState("pvp");
  const [, forceUpdate] = useState(0);

  // Re-render when leaderboard data arrives
  useEffect(() => {
    const handler = () => forceUpdate((n) => n + 1);
    window.addEventListener("gamedata-updated", handler);
    return () => window.removeEventListener("gamedata-updated", handler);
  }, []);

  const rankings = window.GAME_DATA.RANKINGS[period]?.[mode] ?? [];
  const highlights = window.GAME_DATA.HIGHLIGHTS[period]?.[mode] ?? {};
  const longestShot = highlights.longestShot ?? null;
  const longestAlive = highlights.longestAlive ?? null;

  return (
    <div className="app-grid">
      <div className="app-main">

        {/* Hero + Podium */}
        <HeroUnified period={period} setPeriod={setPeriod} mode={mode} setMode={setMode} />

        <section className="hero" style={{ marginTop: -14 }}>
          <div className="hero-inner">
            <Podium players={rankings.slice(0, 3)} />
          </div>
        </section>

        {/* Highlight cards */}
        <div className="highlights">
          <LongestShotCard data={longestShot} />
          <LongestAliveCard data={longestAlive} />
        </div>

        {/* Full ranking table */}
        <RankTable players={rankings} mode={mode} period={period} />

        <footer className="page-foot">
          <span className="page-foot-line">
            <span>DAYZ BRASIL REFORGER</span>
            <span className="page-foot-dot" />
            <span>LEADERBOARD</span>
            <span className="page-foot-dot" />
            <span style={{ color: "var(--primary)" }}>BR-01</span>
          </span>
        </footer>
      </div>

      {/* Kill feed (colapsável) */}
      <KillFeedV3 />
    </div>
  );
}

// Mount
const rootEl = document.getElementById("root");
ReactDOM.createRoot(rootEl).render(<App />);
