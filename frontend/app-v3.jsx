// ===================================================================
// App v3 — Tactical HUD para DayZ Brasil Reforger
// ===================================================================
const { useState, useMemo, useEffect } = React;

const PERIODS = [
  { id: "daily",   label: "DIÁRIO",  short: "24H" },
  { id: "weekly",  label: "SEMANAL", short: "07D" },
  { id: "monthly", label: "MENSAL",  short: "30D" },
];

const ACCENT_OPTIONS = [
  { id: "blood", color: "#d6262d", glow: "#ff4754", label: "Sangue" },
  { id: "amber", color: "#e09030", glow: "#ffb454", label: "Âmbar" },
  { id: "toxic", color: "#7cb342", glow: "#a5e063", label: "Tóxico" },
  { id: "cyan",  color: "#2da9c1", glow: "#5ad8ec", label: "Ciano" },
];

// ===================================================================
// CORNERS / SVG GLYPHS
// ===================================================================
function CornerMarks({ size = 12, color }) {
  const style = color ? { borderColor: color } : undefined;
  return (
    <>
      <span className="cm cm-tl" style={style} />
      <span className="cm cm-tr" style={style} />
      <span className="cm cm-bl" style={style} />
      <span className="cm cm-br" style={style} />
    </>
  );
}

function SkullIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 4a4 4 0 0 1 8 0v3a2 2 0 0 1-1 1.7V10H4V8.7A2 2 0 0 1 3 7V4z" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="5.4" cy="6" r="0.9" fill="currentColor" />
      <circle cx="8.6" cy="6" r="0.9" fill="currentColor" />
      <path d="M6 10v2 M8 10v2 M7 10v2" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function BiohazardIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="1.4" fill="currentColor" />
      <path d="M5.5 6 a3 3 0 0 1 -2.5 -4.3 M8.5 6 a3 3 0 0 0 2.5 -4.3 M7 8.5 a3 3 0 0 0 -2.6 4.4 a3 3 0 0 0 5.2 0 a3 3 0 0 0 -2.6 -4.4"
            stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function CrosshairIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="7" cy="7" r="1.2" fill="currentColor" />
      <line x1="7" y1="0.5" x2="7" y2="2.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="7" y1="11.5" x2="7" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="0.5" y1="7" x2="2.5" y2="7" stroke="currentColor" strokeWidth="1.2" />
      <line x1="11.5" y1="7" x2="13.5" y2="7" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function HexPattern() {
  return (
    <svg className="hex-pattern" aria-hidden="true">
      <defs>
        <pattern id="hexgrid" x="0" y="0" width="60" height="52" patternUnits="userSpaceOnUse">
          <path d="M30 1 L58 16 L58 36 L30 51 L2 36 L2 16 Z"
                fill="none" stroke="currentColor" strokeWidth="0.6" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hexgrid)" />
    </svg>
  );
}

// ===================================================================
// HEADER
// ===================================================================
function ServerHeader() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString("pt-BR", { hour12: false });
  const date = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase().replace(".", "");
  const serverStats = window.GAME_DATA.SERVER_STATS || {};
  const onlineNow = Number(serverStats.onlineNow) || 0;
  const maxPlayers = Number(serverStats.maxPlayers) || 80;

  return (
    <header className="hd3">
      <div className="hd3-left">
        <div className="hd3-logo">
          <svg viewBox="0 0 60 60" width="56" height="56" fill="none" aria-hidden="true">
            <path d="M8 8 L28 8 L28 28 L52 28 L52 52 L28 52 L28 28 L8 28 Z"
                  stroke="currentColor" strokeWidth="3" strokeLinejoin="miter" />
            <path d="M8 8 L28 28 M52 52 L28 28" stroke="currentColor" strokeWidth="1.4" opacity="0.5" />
            <circle cx="28" cy="28" r="3" fill="currentColor" />
            <rect x="8" y="8" width="6" height="1" fill="currentColor" />
            <rect x="8" y="8" width="1" height="6" fill="currentColor" />
            <rect x="46" y="51" width="6" height="1" fill="currentColor" />
            <rect x="51" y="46" width="1" height="6" fill="currentColor" />
          </svg>
          <span className="hd3-logo-bg" aria-hidden="true" />
        </div>
        <div className="hd3-brand">
          <div className="hd3-brand-pre">
            <span className="hd3-pre-id">BR-01</span>
            <span className="hd3-pre-pipe">/</span>
            <span>SERVIDOR BRASIL</span>
            <span className="hd3-pre-pipe">/</span>
            <span>PT-BR · DISCORD</span>
          </div>
          <h1 className="hd3-title">
            <span>DAYZ <em>BRASIL</em></span>
            <span className="hd3-title-2">REFORGER <span className="hd3-tag">LEADERBOARD</span></span>
          </h1>
        </div>
      </div>

      <div className="hd3-right">
        <div className="hd3-stat">
          <div className="hd3-stat-row">
            <span className="hd3-stat-dot hd3-dot-on" />
            <span className="hd3-stat-num">{onlineNow}<span className="hd3-stat-frac">/{maxPlayers}</span></span>
          </div>
          <div className="hd3-stat-label">JOGADORES ONLINE</div>
        </div>
        <div className="hd3-stat">
          <div className="hd3-stat-row">
            <span className="hd3-stat-num hd3-clock">{time}</span>
          </div>
          <div className="hd3-stat-label">{date} · UTC-3</div>
        </div>
        <div className="hd3-stat">
          <div className="hd3-stat-row">
            <span className="hd3-stat-num">14<span className="hd3-stat-frac">d</span> 06<span className="hd3-stat-frac">h</span></span>
          </div>
          <div className="hd3-stat-label">UPTIME · 60FPS</div>
        </div>
      </div>
    </header>
  );
}

// ===================================================================
// COMMAND BAR
// ===================================================================
function CommandBar({ period, setPeriod, mode, setMode }) {
  return (
    <div className="cmd3">
      <div className="cmd3-group">
        <div className="cmd3-label">
          <span className="cmd3-label-bracket">[</span>
          <span>PERÍODO</span>
          <span className="cmd3-label-bracket">]</span>
        </div>
        <div className="cmd3-period" role="tablist">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={period === p.id}
              className={`cmd3-period-btn ${period === p.id ? "is-active" : ""}`}
              onClick={() => setPeriod(p.id)}
            >
              <span className="cmd3-period-short">{p.short}</span>
              <span className="cmd3-period-label">{p.label}</span>
              <span className="cmd3-period-line" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      <div className="cmd3-group cmd3-mode-group">
        <div className="cmd3-label">
          <span className="cmd3-label-bracket">[</span>
          <span>MODO</span>
          <span className="cmd3-label-bracket">]</span>
        </div>
        <div className="cmd3-mode" role="tablist">
          <button
            role="tab"
            aria-selected={mode === "pvp"}
            className={`cmd3-mode-btn ${mode === "pvp" ? "is-active" : ""}`}
            onClick={() => setMode("pvp")}
          >
            <span className="cmd3-mode-icon"><SkullIcon /></span>
            <span className="cmd3-mode-label">
              <span className="cmd3-mode-name">PvP</span>
              <span className="cmd3-mode-desc">PLAYER VS PLAYER</span>
            </span>
          </button>
          <button
            role="tab"
            aria-selected={mode === "pve"}
            className={`cmd3-mode-btn ${mode === "pve" ? "is-active" : ""}`}
            onClick={() => setMode("pve")}
          >
            <span className="cmd3-mode-icon"><BiohazardIcon /></span>
            <span className="cmd3-mode-label">
              <span className="cmd3-mode-name">PvE</span>
              <span className="cmd3-mode-desc">ZUMBIS + BANDIDOS</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// TOP 3 — Character cards
// ===================================================================
const EMPTY_PLAYER = {
  uid: "",
  rank: 0,
  nick: "-",
  region: "-",
  kills: 0,
  deaths: 0,
  kd: "0.00",
  aliveMin: 0,
  headshotPct: 0,
  favWeapon: "-",
  longestShot: { dist: 0, weapon: "-" },
};

function normalizePlayer(player) {
  const source = player || {};
  const shot = source.longestShot || {};
  const kills = Number(source.kills != null ? source.kills : source.value);
  const deaths = Number(source.deaths);
  const kd = source.kd != null
    ? source.kd
    : ((kills || 0) / Math.max(deaths || 0, 1)).toFixed(2);

  return {
    ...EMPTY_PLAYER,
    ...source,
    nick: source.nick || source.name || EMPTY_PLAYER.nick,
    region: source.region || EMPTY_PLAYER.region,
    kills: Number.isFinite(kills) ? kills : EMPTY_PLAYER.kills,
    deaths: Number.isFinite(deaths) ? deaths : EMPTY_PLAYER.deaths,
    kd,
    aliveMin: Number.isFinite(Number(source.aliveMin)) ? Number(source.aliveMin) : EMPTY_PLAYER.aliveMin,
    headshotPct: Number.isFinite(Number(source.headshotPct)) ? Number(source.headshotPct) : EMPTY_PLAYER.headshotPct,
    favWeapon: source.favWeapon || EMPTY_PLAYER.favWeapon,
    longestShot: {
      dist: Number.isFinite(Number(shot.dist)) ? Number(shot.dist) : EMPTY_PLAYER.longestShot.dist,
      weapon: shot.weapon || EMPTY_PLAYER.longestShot.weapon,
    },
  };
}

function CharCard({ place, player }) {
  const safePlayer = normalizePlayer(player);
  const labels = { 1: "01", 2: "02", 3: "03" };
  const titles = { 1: "CAMPEÃO", 2: "VICE-LÍDER", 3: "TERCEIRO" };

  return (
    <article className={`cc cc-${place}`}>
      <span className="cc-glow" aria-hidden="true" />
      <span className="cc-scan" aria-hidden="true" />
      <CornerMarks />

      {place === 1 && (
        <span className="cc-crown" aria-hidden="true">
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
            <path d="M1 9 L2 3 L4.5 6 L7 1 L9.5 6 L12 3 L13 9 Z" fill="currentColor" />
            <rect x="1" y="9" width="12" height="1" fill="currentColor" />
          </svg>
          <span>CAMPEÃO</span>
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
            <path d="M1 9 L2 3 L4.5 6 L7 1 L9.5 6 L12 3 L13 9 Z" fill="currentColor" />
            <rect x="1" y="9" width="12" height="1" fill="currentColor" />
          </svg>
        </span>
      )}

      <header className="cc-head">
        <div className="cc-rank">
          <span className="cc-rank-hash">#</span>
          <span className="cc-rank-num">{labels[place]}</span>
        </div>
        <div className="cc-rank-meta">
          <span className="cc-region">{safePlayer.region}</span>
          <span className="cc-tag">{titles[place]}</span>
        </div>
      </header>

      <div className="cc-watermark" aria-hidden="true">{labels[place]}</div>

      <div className="cc-id">
        <div className="cc-id-pre">
          <span className="cc-id-line" />
          <span>JOGADOR</span>
          <span className="cc-id-line" />
        </div>
        <h3 className="cc-nick">{safePlayer.nick}</h3>
      </div>

      <div className="cc-stats">
        <div className="cc-stat">
          <span className="cc-stat-val">{safePlayer.kills}</span>
          <span className="cc-stat-lbl">KILLS</span>
        </div>
        <div className="cc-stat">
          <span className="cc-stat-val">{safePlayer.deaths}</span>
          <span className="cc-stat-lbl">MORTES</span>
        </div>
        <div className="cc-stat cc-stat-kd">
          <span className="cc-stat-val accent">{safePlayer.kd}</span>
          <span className="cc-stat-lbl">K/D</span>
        </div>
        <div className="cc-stat">
          <span className="cc-stat-val">{safePlayer.headshotPct}<i>%</i></span>
          <span className="cc-stat-lbl">HEADSHOT</span>
        </div>
      </div>

      <div className="cc-shot">
        <div className="cc-shot-l">
          <span className="cc-shot-icon"><CrosshairIcon size={14} /></span>
          <div className="cc-shot-text">
            <span className="cc-shot-lbl">MELHOR TIRO</span>
            <span className="cc-shot-wpn">{safePlayer.longestShot.weapon}</span>
          </div>
        </div>
        <div className="cc-shot-r">
          <span className="cc-shot-dist">{safePlayer.longestShot.dist}<i>m</i></span>
        </div>
      </div>

      <footer className="cc-foot">
        <div className="cc-foot-row">
          <span className="cc-foot-lbl">ARMA PRIMÁRIA</span>
          <span className="cc-foot-val">
            <CrosshairIcon size={12} />
            {safePlayer.favWeapon}
          </span>
        </div>
        <div className="cc-foot-row">
          <span className="cc-foot-lbl">TEMPO VIVO</span>
          <span className="cc-foot-val mono">{window.GAME_DATA.formatAlive(safePlayer.aliveMin)}</span>
        </div>
      </footer>
    </article>
  );
}

function CharCardRow({ players }) {
  const safePlayers = players || [];
  const [first, second, third] = [0, 1, 2].map((index) => normalizePlayer(safePlayers[index]));
  return (
    <div className="cc-row">
      <CharCard place={2} player={second} />
      <CharCard place={1} player={first} />
      <CharCard place={3} player={third} />
    </div>
  );
}

// === Pódio Clássico ===
function PodiumBlock({ place, player }) {
  const safePlayer = normalizePlayer(player);
  const heights = { 1: 280, 2: 200, 3: 160 };
  const labels = { 1: "01", 2: "02", 3: "03" };
  const titles = { 1: "CAMPEÃO", 2: "VICE", 3: "TERCEIRO" };
  return (
    <div className={`pdm pdm-${place}`}>
      <div className="pdm-meta">
        <div className="pdm-title">{titles[place]}</div>
        <div className="pdm-nick">{safePlayer.nick}</div>
        <div className="pdm-region">{safePlayer.region}</div>
        <div className="pdm-stats">
          <div><span>{safePlayer.kills}</span><label>KILLS</label></div>
          <div><span>{safePlayer.deaths}</span><label>MORTES</label></div>
          <div><span className="accent">{safePlayer.kd}</span><label>K/D</label></div>
        </div>
      </div>
      <div className="pdm-tower" style={{ height: heights[place] }}>
        <CornerMarks />
        <div className="pdm-tower-rank">{labels[place]}</div>
        <div className="pdm-tower-sub">RANK</div>
      </div>
    </div>
  );
}

function PodiumClassic({ players }) {
  const safePlayers = players || [];
  const [first, second, third] = [0, 1, 2].map((index) => normalizePlayer(safePlayers[index]));
  return (
    <div className="pdm-row">
      <PodiumBlock place={2} player={second} />
      <PodiumBlock place={1} player={first} />
      <PodiumBlock place={3} player={third} />
    </div>
  );
}

// ===================================================================
// HIGHLIGHTS
// ===================================================================
function LongestShotCard({ data }) {
  return (
    <article className="hl3 hl3-shot">
      <CornerMarks />
      <header className="hl3-head">
        <span className="hl3-eyebrow">
          <span className="hl3-eyebrow-dot" />
          DESTAQUE · PRECISÃO
        </span>
        <h3>TIRO MAIS LONGO</h3>
        <span className="hl3-badge">
          <CrosshairIcon size={11} />
          RECORDE
        </span>
      </header>

      <div className="hl3-player">
        <div className="hl3-player-l">
          <div className="hl3-player-eyebrow">
            <span className="hl3-player-line" />
            <span>ATIRADOR</span>
          </div>
          <h4 className="hl3-player-nick">{data.nick}</h4>
          <div className="hl3-player-meta">
            <span className="hl3-player-region">{data.region}</span>
            <span className="hl3-player-sep" />
            <span className="hl3-player-loc">{data.location}</span>
          </div>
        </div>
        <div className="hl3-player-r">
          <span className="hl3-player-wpn">
            <CrosshairIcon size={12} />
            {data.weapon}
          </span>
        </div>
      </div>

      <div className="hl3-shot-hero">
        <span className="hl3-shot-num">{data.dist.toLocaleString("pt-BR")}</span>
        <div className="hl3-shot-unit-col">
          <span className="hl3-shot-unit">METROS</span>
          <span className="hl3-shot-rule" />
        </div>
      </div>

      <div className="hl3-shot-scale" aria-hidden="true">
        <svg viewBox="0 0 340 56" width="100%" height="56" preserveAspectRatio="none">
          {/* base line */}
          <line x1="0" y1="42" x2="340" y2="42" stroke="currentColor" strokeWidth="1" opacity="0.5" />
          {/* scale ticks */}
          {[0, 250, 500, 750, 1000, 1250, 1500].map((d, i) => {
            const x = (d / 1500) * 332 + 4;
            const isMajor = d % 500 === 0;
            return (
              <g key={d}>
                <line x1={x} y1="42" x2={x} y2={isMajor ? 32 : 36} stroke="currentColor" strokeWidth={isMajor ? 1.2 : 0.6} opacity={isMajor ? 0.8 : 0.4} />
                {isMajor && (
                  <text x={x} y="54" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="currentColor" opacity="0.55">
                    {d}M
                  </text>
                )}
              </g>
            );
          })}
          {/* shot trajectory arc */}
          {(() => {
            const x = Math.min((data.dist / 1500) * 332 + 4, 332);
            return (
              <g>
                <path d={`M 4 42 Q ${x / 2} ${-4} ${x} 42`} stroke="currentColor" strokeWidth="1.6" fill="none" strokeDasharray="3 3" opacity="0.85" />
                <circle cx="4" cy="42" r="3.5" fill="currentColor" />
                <g transform={`translate(${x} 42)`} stroke="currentColor" strokeWidth="1.2" fill="none">
                  <circle r="6" />
                  <line x1="-10" y1="0" x2="-3" y2="0" />
                  <line x1="3" y1="0" x2="10" y2="0" />
                  <line x1="0" y1="-10" x2="0" y2="-3" />
                  <line x1="0" y1="3" x2="0" y2="10" />
                </g>
              </g>
            );
          })()}
        </svg>
      </div>

      <div className="hl3-info">
        <div className="hl3-info-cell">
          <span className="hl3-info-lbl">DISTÂNCIA REAL</span>
          <span className="hl3-info-val mono">{data.dist.toLocaleString("pt-BR")} m</span>
        </div>
        <div className="hl3-info-cell hl3-info-cell-r">
          <span className="hl3-info-lbl">TIPO DO TIRO</span>
          <span className="hl3-info-val">Longíssima distância</span>
        </div>
      </div>
    </article>
  );
}

function LongestAliveCard({ data }) {
  const days = Math.floor(data.aliveMin / 1440);
  const hours = Math.floor((data.aliveMin % 1440) / 60);
  const mins = data.aliveMin % 60;
  return (
    <article className="hl3 hl3-alive">
      <CornerMarks />
      <header className="hl3-head">
        <span className="hl3-eyebrow">
          <span className="hl3-eyebrow-dot" />
          DESTAQUE · SOBREVIVÊNCIA
        </span>
        <h3>MAIOR TEMPO VIVO</h3>
        <span className="hl3-badge">
          <BiohazardIcon size={11} />
          RECORDE
        </span>
      </header>

      <div className="hl3-player hl3-player-alive">
        <div className="hl3-player-l">
          <div className="hl3-player-eyebrow">
            <span className="hl3-player-line" />
            <span>SOBREVIVENTE</span>
          </div>
          <h4 className="hl3-player-nick">{data.nick}</h4>
          <div className="hl3-player-meta">
            <span className="hl3-player-region">{data.region}</span>
            <span className="hl3-player-sep" />
            <span className="hl3-player-loc">{data.location}</span>
          </div>
        </div>
        <div className="hl3-player-r">
          <span className="hl3-player-status">
            <span className="hl3-player-status-dot" />
            VIVO
          </span>
        </div>
      </div>

      <div className="hl3-clock">
        <div className="hl3-tu">
          <span className="hl3-tu-val">{String(days).padStart(2, "0")}</span>
          <span className="hl3-tu-lbl">DIAS</span>
        </div>
        <span className="hl3-tu-sep">:</span>
        <div className="hl3-tu">
          <span className="hl3-tu-val">{String(hours).padStart(2, "0")}</span>
          <span className="hl3-tu-lbl">HORAS</span>
        </div>
        <span className="hl3-tu-sep">:</span>
        <div className="hl3-tu">
          <span className="hl3-tu-val">{String(mins).padStart(2, "0")}</span>
          <span className="hl3-tu-lbl">MIN</span>
        </div>
      </div>

      <div className="hl3-pulse" aria-hidden="true">
        <svg viewBox="0 0 340 56" width="100%" height="56" preserveAspectRatio="none">
          <line x1="0" y1="28" x2="340" y2="28" stroke="currentColor" strokeWidth="0.5" opacity="0.25" strokeDasharray="2 4" />
          <polyline
            points="0,28 28,28 36,14 44,40 52,28 90,28 98,18 106,38 114,28 154,28 162,2 172,52 180,28 224,28 232,16 240,40 248,28 286,28 294,18 302,40 310,28 340,28"
            fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="hl3-info">
        <div className="hl3-info-cell">
          <span className="hl3-info-lbl">EM MINUTOS</span>
          <span className="hl3-info-val mono">{data.aliveMin.toLocaleString("pt-BR")} min</span>
        </div>
        <div className="hl3-info-cell hl3-info-cell-r">
          <span className="hl3-info-lbl">STATUS DE LOOT</span>
          <span className="hl3-info-val">Lendário</span>
        </div>
      </div>
    </article>
  );
}

// ===================================================================
// TABELA
// ===================================================================
function KDPill({ value }) {
  const tier = value >= 4 ? "high" : value >= 2 ? "mid" : "low";
  return <span className={`kdpill kdpill-${tier}`}>{value.toFixed(2)}</span>;
}

function RankTable({ players, mode, period, onShowAll }) {
  const { formatAlive } = window.GAME_DATA;
  const top10 = players.slice(0, 10);
  const maxKills = Math.max(...top10.map((p) => p.kills));
  return (
    <section className="tb3">
      <header className="tb3-head">
        <div className="tb3-head-l">
          <span className="tb3-eyebrow">
            <span className="tb3-eyebrow-line" />
            REGISTRO COMPLETO
          </span>
          <h2 className="tb3-title">RANKING TOP <span className="accent">10</span></h2>
        </div>
        <div className="tb3-head-r">
          <span className="tb3-badge">{period}</span>
          <span className="tb3-badge tb3-badge-mode">{mode === "pvp" ? "PvP" : "PvE"}</span>
        </div>
      </header>
      <div className="tb3-wrap">
        <table className="tb3-table">
          <thead>
            <tr>
              <th className="tb3-th-rank">POS</th>
              <th className="tb3-th-nick">JOGADOR</th>
              <th className="tb3-th-num">KILLS</th>
              <th className="tb3-th-num">MORTES</th>
              <th className="tb3-th-num">K/D</th>
              <th className="tb3-th-num">TEMPO VIVO</th>
            </tr>
          </thead>
          <tbody>
            {top10.map((p) => {
              const pct = (p.kills / maxKills) * 100;
              return (
                <tr key={p.rank} className={p.rank <= 3 ? "is-top" : ""}>
                  <td className="tb3-td-rank">
                    <span className={`tb3-rank tb3-rank-${p.rank <= 3 ? p.rank : "n"}`}>
                      {String(p.rank).padStart(2, "0")}
                    </span>
                  </td>
                  <td className="tb3-td-nick">
                    <span className="tb3-region">{p.region}</span>
                    <span className="tb3-nick">{p.nick}</span>
                  </td>
                  <td className="tb3-td-num">
                    <span className="tb3-bar-wrap">
                      <span className="tb3-bar-track">
                        <span className="tb3-bar-fill" style={{ width: pct + "%" }} />
                      </span>
                      <span className="tb3-bar-val">{p.kills}</span>
                    </span>
                  </td>
                  <td className="tb3-td-num mono">{p.deaths}</td>
                  <td className="tb3-td-num"><KDPill value={p.kd} /></td>
                  <td className="tb3-td-num mono">{formatAlive(p.aliveMin)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="tb3-foot">
        <div className="tb3-foot-info">
          Mostrando <b>10</b> de <b>{players.length}</b> jogadores ativos
        </div>
        <button className="tb3-cta" onClick={onShowAll}>
          <span>VER LISTA COMPLETA</span>
          <svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden="true">
            <path d="M1 6 L13 6 M9 1 L14 6 L9 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
          </svg>
        </button>
      </footer>
    </section>
  );
}

// ===================================================================
// FULL LIST MODAL
// ===================================================================
function FullListModal({ players, mode, period, onClose }) {
  const { formatAlive } = window.GAME_DATA;
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("rank");

  const filtered = useMemo(() => {
    let arr = players;
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter((p) => p.nick.toLowerCase().includes(q) || p.region.toLowerCase().includes(q));
    }
    const sorted = [...arr].sort((a, b) => {
      if (sortBy === "rank") return a.rank - b.rank;
      if (sortBy === "kills") return b.kills - a.kills;
      if (sortBy === "deaths") return b.deaths - a.deaths;
      if (sortBy === "kd") return b.kd - a.kd;
      if (sortBy === "alive") return b.aliveMin - a.aliveMin;
      if (sortBy === "hs") return b.headshotPct - a.headshotPct;
      return 0;
    });
    return sorted;
  }, [players, search, sortBy]);

  // Esc fecha modal
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const sortCols = [
    { id: "rank",   label: "POS" },
    { id: "nick",   label: "JOGADOR", noSort: true },
    { id: "kills",  label: "KILLS" },
    { id: "deaths", label: "MORTES" },
    { id: "kd",     label: "K/D" },
    { id: "hs",     label: "HS%" },
    { id: "alive",  label: "TEMPO VIVO" },
    { id: "weapon", label: "ARMA PREF.", noSort: true },
  ];

  return (
    <div className="fl-backdrop" onClick={onClose}>
      <div className="fl-modal" onClick={(e) => e.stopPropagation()}>
        <header className="fl-head">
          <div className="fl-head-l">
            <span className="fl-eyebrow">
              <span className="fl-eyebrow-line" />
              REGISTRO COMPLETO
            </span>
            <h2 className="fl-title">TODOS OS JOGADORES</h2>
            <div className="fl-meta">
              <span className="fl-badge">{period}</span>
              <span className="fl-badge fl-badge-mode">{mode === "pvp" ? "PvP" : "PvE"}</span>
              <span className="fl-meta-count"><b>{players.length}</b> jogadores ativos</span>
            </div>
          </div>
          <button className="fl-close" onClick={onClose} aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2 L14 14 M14 2 L2 14" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <span>ESC</span>
          </button>
        </header>

        <div className="fl-toolbar">
          <div className="fl-search">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por nick ou região…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="fl-result">
            <span className="mono">{filtered.length}</span> resultado{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="fl-wrap">
          <table className="fl-table">
            <thead>
              <tr>
                {sortCols.map((c) => (
                  <th
                    key={c.id}
                    className={`${c.id === "rank" ? "fl-th-rank" : ""} ${c.id === "nick" ? "fl-th-nick" : "fl-th-num"} ${c.noSort ? "" : "fl-th-sortable"} ${sortBy === c.id ? "is-sorted" : ""}`}
                    onClick={() => !c.noSort && setSortBy(c.id)}
                  >
                    {c.label}
                    {!c.noSort && sortBy === c.id && <span className="fl-sort-mark">▼</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.rank}>
                  <td className="fl-td-rank">
                    <span className={`fl-rank fl-rank-${p.rank <= 3 ? p.rank : "n"}`}>
                      {String(p.rank).padStart(2, "0")}
                    </span>
                  </td>
                  <td className="fl-td-nick">
                    <span className="fl-region">{p.region}</span>
                    <span className="fl-nick">{p.nick}</span>
                  </td>
                  <td className="fl-td-num mono">{p.kills}</td>
                  <td className="fl-td-num mono">{p.deaths}</td>
                  <td className="fl-td-num"><KDPill value={p.kd} /></td>
                  <td className="fl-td-num mono">{p.headshotPct}%</td>
                  <td className="fl-td-num mono">{formatAlive(p.aliveMin)}</td>
                  <td className="fl-td-wpn">{p.favWeapon}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="fl-empty">Nenhum jogador encontrado para “{search}”</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="fl-foot">
          <span>Use as colunas para ordenar · ESC para fechar</span>
        </footer>
      </div>
    </div>
  );
}

// ===================================================================
// ===================================================================
// TWEAKS
// ===================================================================
const DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "blood",
  "podiumVariant": "char",
  "theme": "dark"
}/*EDITMODE-END*/;

function TweaksUI({ t, setTweak }) {
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection title="Cor de destaque">
        <div className="tw-swatches">
          {ACCENT_OPTIONS.map((a) => (
            <button
              key={a.id}
              className={`tw-swatch ${t.accent === a.id ? "is-on" : ""}`}
              style={{
                background: a.color,
                boxShadow: t.accent === a.id ? `0 0 0 2px var(--surface), 0 0 0 4px ${a.color}` : "none",
              }}
              onClick={() => setTweak("accent", a.id)}
              aria-label={a.label}
              title={a.label}
            />
          ))}
        </div>
      </TweakSection>
      <TweakRadio
        label="Top 3"
        value={t.podiumVariant}
        onChange={(v) => setTweak("podiumVariant", v)}
        options={[
          { value: "char", label: "Char Cards" },
          { value: "podium", label: "Pódio" },
        ]}
      />
      <TweakRadio
        label="Tema"
        value={t.theme}
        onChange={(v) => setTweak("theme", v)}
        options={[
          { value: "dark", label: "Escuro" },
          { value: "light", label: "Claro" },
        ]}
      />
    </TweaksPanel>
  );
}

// ===================================================================
// SAFEZONE
// ===================================================================
function MoneyIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1.5" y="3" width="11" height="8" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="3.5" cy="7" r="0.6" fill="currentColor" />
      <circle cx="10.5" cy="7" r="0.6" fill="currentColor" />
    </svg>
  );
}

function CartIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1 2 H3 L4.2 9 H11.5 L12.5 4 H4.2" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="miter" />
      <circle cx="5.5" cy="12" r="1" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="10.5" cy="12" r="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function SafezoneCard({ kind, data, periodLabel }) {
  const { formatBRL } = window.GAME_DATA;
  const isSeller = kind === "seller";
  const title = isSeller ? "MAIOR VENDEDOR" : "MAIOR COMPRADOR";
  const eyebrow = isSeller ? "SAFEZONE · COMÉRCIO" : "SAFEZONE · CONSUMO";
  const subjectLbl = isSeller ? "VENDEDOR" : "COMPRADOR";
  const totalLbl = isSeller ? "TOTAL ARRECADADO" : "TOTAL DESEMBOLSADO";
  const txLbl = isSeller ? "VENDAS" : "COMPRAS";
  const Icon = isSeller ? MoneyIcon : CartIcon;
  const verb = isSeller ? "OPERADOR" : "CLIENTE";

  // monta os dígitos do "vault counter"
  const digits = data.total.toString().padStart(6, "0").split("");

  // tier de raridade por item (mock determinístico)
  const itemTier = (name, i) => {
    const tiers = ["common", "rare", "legendary"];
    const idx = Math.abs((name.charCodeAt(0) + i * 7) % tiers.length);
    return tiers[idx];
  };

  return (
    <article className={`sz sz-${kind}`}>
      <div className="sz-bg-grid" aria-hidden="true" />
      <CornerMarks />

      {/* Stamp rotated, ornamental */}
      <div className={`sz-stamp sz-stamp-${kind}`} aria-hidden="true">
        <span className="sz-stamp-line" />
        <span className="sz-stamp-text">
          {isSeller ? "TRADER OFICIAL" : "CLIENTE VIP"}
        </span>
        <span className="sz-stamp-sub">SAFEZONE · BR-01</span>
        <span className="sz-stamp-line" />
      </div>

      <header className="hl3-head">
        <span className="hl3-eyebrow">
          <span className="hl3-eyebrow-dot" />
          {eyebrow}
        </span>
        <h3>{title}</h3>
        <span className="hl3-badge">
          <Icon size={11} />
          {periodLabel}
        </span>
      </header>

      <div className="hl3-player sz-player">
        <div className="hl3-player-l">
          <div className="hl3-player-eyebrow">
            <span className="hl3-player-line" />
            <span>{subjectLbl}</span>
          </div>
          <h4 className="hl3-player-nick">{data.nick}</h4>
          <div className="hl3-player-meta">
            <span className="hl3-player-region">SAFEZONE</span>
            <span className="hl3-player-sep" />
            <span className="hl3-player-loc">{data.transactions} {txLbl.toLowerCase()}</span>
          </div>
        </div>
        <div className="hl3-player-r">
          <span className="sz-player-tag">
            <Icon size={12} />
            {verb}
          </span>
        </div>
      </div>

      {/* Vault counter — display de cofre em destaque */}
      <div className="sz-vault" aria-label={formatBRL(data.total)}>
        <div className="sz-vault-bg" aria-hidden="true">
          <svg viewBox="0 0 200 80" width="100%" height="100%" preserveAspectRatio="none">
            <defs>
              <pattern id={`sz-money-${kind}`} x="0" y="0" width="40" height="20" patternUnits="userSpaceOnUse">
                <rect x="2" y="2" width="36" height="16" fill="none" stroke="currentColor" strokeWidth="0.5" />
                <circle cx="20" cy="10" r="3" fill="none" stroke="currentColor" strokeWidth="0.5" />
                <line x1="2" y1="10" x2="9" y2="10" stroke="currentColor" strokeWidth="0.4" />
                <line x1="31" y1="10" x2="38" y2="10" stroke="currentColor" strokeWidth="0.4" />
              </pattern>
            </defs>
            <rect width="200" height="80" fill={`url(#sz-money-${kind})`} />
          </svg>
        </div>

        <div className="sz-vault-head">
          <span className="sz-vault-head-dot" />
          <span className="sz-vault-head-lbl">{totalLbl}</span>
          <span className="sz-vault-head-period">· {periodLabel}</span>
        </div>

        <div className="sz-vault-display">
          <span className="sz-vault-currency">R$</span>
          <span className="sz-vault-num">
            {data.total.toLocaleString("pt-BR")}
            <span className="sz-vault-cents">,00</span>
          </span>
        </div>

        <div className="sz-vault-foot">
          <span className="sz-vault-foot-cell">
            <span className="sz-vault-foot-dot" />
            <span className="sz-vault-foot-lbl">TRANSAÇÕES</span>
            <span className="sz-vault-foot-val">{data.transactions}</span>
          </span>
          <span className="sz-vault-foot-cell">
            <span className="sz-vault-foot-dot" />
            <span className="sz-vault-foot-lbl">RANKING</span>
            <span className="sz-vault-foot-val">#1 GERAL</span>
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
        <div className="sz-section-l">
          <span className="sz-section-eyebrow">
            <span className="sz-section-eyebrow-line" />
            ECONOMIA DO SERVIDOR
          </span>
          <h2 className="sz-section-title">SAFEZONE <span className="accent">//</span> TOP COMÉRCIO</h2>
        </div>
        <div className="sz-section-r">
          <span className="sz-section-badge">{periodLabel}</span>
        </div>
      </header>
      <div className="sz-grid">
        <SafezoneCard kind="seller" data={data.seller} periodLabel={periodLabel} />
        <SafezoneCard kind="buyer"  data={data.buyer}  periodLabel={periodLabel} />
      </div>
    </section>
  );
}

// ===================================================================
// ROOT
// ===================================================================
function App() {
  const [tweaks, setTweak] = useTweaks(DEFAULTS);
  const [period, setPeriod] = useState("daily");
  const [mode, setMode] = useState("pvp");
  const [showFullList, setShowFullList] = useState(false);

  // Force re-render when data.jsx finishes a refresh — see CustomEvent
  // 'gamedata-updated' dispatched at the end of refreshAll(). Without this
  // the React tree would stay stuck on the empty initial snapshot.
  const [, setDataTick] = useState(0);
  useEffect(() => {
    const handler = () => setDataTick((v) => v + 1);
    window.addEventListener("gamedata-updated", handler);
    return () => window.removeEventListener("gamedata-updated", handler);
  }, []);

  const players = window.GAME_DATA.RANKINGS[period][mode];
  const highlights = window.GAME_DATA.HIGHLIGHTS[period][mode];
  const safezone = window.GAME_DATA.SAFEZONE[period];
  const top3 = players.slice(0, 3);

  useEffect(() => {
    const accent = ACCENT_OPTIONS.find((a) => a.id === tweaks.accent) || ACCENT_OPTIONS[0];
    document.documentElement.style.setProperty("--primary", accent.color);
    document.documentElement.style.setProperty("--primary-glow", accent.glow);
    document.documentElement.dataset.theme = tweaks.theme;
  }, [tweaks.accent, tweaks.theme]);

  return (
    <div className="app3" data-mode={mode}>
      <HexPattern />

      <div className="app3-grid">
        <main className="app3-main">
          <ServerHeader />
          <CommandBar period={period} setPeriod={setPeriod} mode={mode} setMode={setMode} />

          <section className="hero3" data-screen-label="Hero / Top 3">
            <div className="hero3-eyebrow">
              <span className="hero3-bracket">[</span>
              <span>TOP JOGADORES</span>
              <span className="hero3-dot">·</span>
              <span className="accent">{PERIODS.find((p) => p.id === period).label}</span>
              <span className="hero3-dot">·</span>
              <span className="accent">{mode === "pvp" ? "PvP" : "PvE"}</span>
              <span className="hero3-bracket">]</span>
            </div>
            {tweaks.podiumVariant === "podium"
              ? <PodiumClassic players={top3} />
              : <CharCardRow players={top3} />}
          </section>

          <section className="highlights3" data-screen-label="Destaques">
            <LongestShotCard data={highlights.longestShot} />
            <LongestAliveCard data={highlights.longestAlive} />
          </section>

          <SafezoneSection data={safezone} period={period} />

          <RankTable
            players={players}
            mode={mode}
            period={PERIODS.find((p) => p.id === period).label}
            onShowAll={() => setShowFullList(true)}
          />

          <footer className="ft3">
            <div className="ft3-l">
              <span className="ft3-dot" />
              <span>DAYZ BRASIL REFORGER</span>
              <span className="ft3-sep">·</span>
              <span>API v1.2.3</span>
            </div>
            <div className="ft3-r">
              <span>SYNC HÁ 2 MIN</span>
              <span className="ft3-sep">·</span>
              <span>BUILD 04.2026</span>
            </div>
          </footer>
        </main>

        <KillFeedV3 />
      </div>

      {showFullList && (
        <FullListModal
          players={players}
          mode={mode}
          period={PERIODS.find((p) => p.id === period).label}
          onClose={() => setShowFullList(false)}
        />
      )}

      <TweaksUI t={tweaks} setTweak={setTweak} />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
