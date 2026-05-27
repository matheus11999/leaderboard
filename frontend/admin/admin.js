'use strict';

// ===================================================================
// BrasilZ Admin Panel — vanilla JS SPA hitting /api/admin/*.
// JWT is set as httpOnly cookie by the backend on login, so requests
// here just rely on credentials: same-origin.
// ===================================================================

const API_BASE = '/api/admin';

const state = {
  user: null,
  current: 'overview',
  pagers: {
    players:  { offset: 0, limit: 50, total: 0 },
    kills:    { offset: 0, limit: 50, total: 0 },
    sessions: { offset: 0, limit: 50, total: 0 },
    shop:     { offset: 0, limit: 50, total: 0 },
    bounty:   { offset: 0, limit: 50, total: 0 },
    missions: { offset: 0, limit: 50, total: 0 },
    events:   { offset: 0, limit: 100, total: 0 },
  },
};

// ---------- HTTP helpers ----------
async function api(method, path, body) {
  const opts = {
    method,
    credentials: 'same-origin',
    headers: { 'Accept': 'application/json' },
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(API_BASE + path, opts);
  if (res.status === 401) {
    showLogin();
    throw new Error('unauthorized');
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!res.ok) {
    const msg = data?.error || data?.message || res.statusText;
    throw new Error(msg);
  }
  return data;
}

// ---------- screens ----------
function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('dashboard').classList.add('hidden');
}
function showDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  switchTab(state.current);
}

// ---------- auth ----------
async function checkAuth() {
  try {
    const me = await api('GET', '/me');
    state.user = me.admin;
    document.getElementById('topbar-user').textContent = state.user.username || 'admin';
    showDashboard();
  } catch {
    showLogin();
  }
}

async function doLogin(ev) {
  ev.preventDefault();
  const form = ev.target;
  const errBox = document.getElementById('login-error');
  errBox.textContent = '';
  const username = form.elements.username.value.trim();
  const password = form.elements.password.value;
  try {
    const r = await api('POST', '/login', { username, password });
    state.user = { username: r.username };
    document.getElementById('topbar-user').textContent = r.username || 'admin';
    showDashboard();
  } catch (err) {
    errBox.textContent = 'Falha no login: ' + err.message;
  }
}

async function doLogout() {
  try { await api('POST', '/logout'); } catch { /* ignore */ }
  state.user = null;
  showLogin();
}

// ---------- tabs ----------
function switchTab(name) {
  state.current = name;
  for (const btn of document.querySelectorAll('.tab')) btn.classList.toggle('is-active', btn.dataset.tab === name);
  for (const pane of document.querySelectorAll('.tab-pane')) pane.classList.toggle('is-active', pane.id === 'pane-' + name);
  refreshTab(name);
}

async function refreshTab(name) {
  switch (name) {
    case 'overview': return loadOverview();
    case 'players':  return loadPlayers();
    case 'kills':    return loadKills();
    case 'sessions': return loadSessions();
    case 'shop':     return loadShop();
    case 'bounty':   return loadBounty();
    case 'missions': return loadMissions();
    case 'events':   return loadEvents();
  }
}

// ---------- overview ----------
async function loadOverview() {
  const container = document.getElementById('overview-stats');
  container.innerHTML = '<div class="stat-card-label">CARREGANDO…</div>';
  try {
    const d = await api('GET', '/overview');
    const cards = [
      { label: 'PLAYERS REGISTRADOS', value: d.players },
      { label: 'ONLINE AGORA', value: d.sessions_open },
      { label: 'SESSÕES TOTAIS', value: d.sessions },
      { label: 'KILLS TOTAIS', value: d.kills_total },
      { label: 'KILLS PVP', value: d.kills_pvp },
      { label: 'KILLS ÚLTIMAS 24H', value: d.kills_last_24h },
      { label: 'EVENTOS DE LOJA', value: d.shop_events },
      { label: 'BOUNTIES ATIVOS', value: d.bounties_active },
      { label: 'RECOMPENSAS PEND.', value: d.bounties_pending },
      { label: 'VOLUME ECONÔMICO', value: formatBRL(d.shop_volume_total) },
      { label: 'MISSÕES TOTAIS', value: d.missions_total },
      { label: 'MISSÕES ATIVAS', value: d.missions_active },
      { label: 'EVENTOS RAW', value: d.events_raw_total },
      { label: 'EVENTOS NÃO PROC.', value: d.events_raw_unprocessed, foot: d.events_raw_unprocessed > 0 ? 'precisa atenção' : 'OK' },
      { label: 'UPTIME API', value: formatUptime(d.uptime_s) },
    ];
    container.innerHTML = cards.map(c => `
      <div class="stat-card">
        <div class="stat-card-label">${c.label}</div>
        <div class="stat-card-value">${c.value}</div>
        ${c.foot ? `<div class="stat-card-foot">${c.foot}</div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="stat-card-label">Erro: ${err.message}</div>`;
  }
}

// ---------- players ----------
async function loadPlayers() {
  const pager = state.pagers.players;
  const search = document.getElementById('players-search').value.trim();
  const banned = document.getElementById('players-banned').value;
  const q = new URLSearchParams({ limit: pager.limit, offset: pager.offset });
  if (search) q.set('search', search);
  if (banned) q.set('banned', banned);
  try {
    const d = await api('GET', '/players?' + q);
    pager.total = d.total;
    renderTable('players-table', [
      { key: 'uid', label: 'UID' },
      { key: 'name', label: 'NOME' },
      { key: 'last_seen', label: 'ÚLTIMA VEZ', render: v => fmtDate(v) },
      { key: 'total_kills', label: 'K' },
      { key: 'total_deaths', label: 'D' },
      { key: 'current_kill_streak', label: 'SEQ' },
      { key: 'best_kill_streak', label: 'MELHOR SEQ' },
      { key: 'bounty_active', label: 'BOUNTY', render: (_v, r) => r.bounty_active ? `<span class="pill is-warn">R$ ${Number(r.bounty_value || 0).toLocaleString('pt-BR')}</span>` : '<span class="pill">—</span>' },
      { key: 'longest_shot_m', label: 'TIRO MAX (m)', render: v => Math.round(Number(v) || 0) },
      { key: 'longest_life_s', label: 'VIDA MAX', render: v => fmtSeconds(v) },
      { key: 'total_playtime_s', label: 'JOGADO', render: v => fmtSeconds(v) },
      { key: 'is_banned', label: 'BAN', render: v => v ? '<span class="pill is-err">BANIDO</span>' : '<span class="pill is-ok">OK</span>' },
    ], d.rows, [
      { label: 'BAN', kind: 'warn', onClick: r => banPlayer(r.uid, !r.is_banned) },
      { label: 'DEL', kind: 'danger', onClick: r => confirmDelete('jogador ' + r.name, () => apiDelete('/players/' + encodeURIComponent(r.uid), 'players')) },
    ]);
    renderPager('players-pager', 'players');
  } catch (err) {
    alert('Erro players: ' + err.message);
  }
}

async function banPlayer(uid, ban) {
  try {
    await api('POST', '/players/' + encodeURIComponent(uid) + '/ban', { ban });
    loadPlayers();
  } catch (err) { alert('Falha ban: ' + err.message); }
}

// ---------- kills ----------
async function loadKills() {
  const pager = state.pagers.kills;
  const q = new URLSearchParams({ limit: pager.limit, offset: pager.offset });
  const s = document.getElementById('kills-search').value.trim();
  const t = document.getElementById('kills-type').value;
  if (s) q.set('search', s);
  if (t) q.set('killer_type', t);
  try {
    const d = await api('GET', '/kills?' + q);
    pager.total = d.total;
    renderTable('kills-table', [
      { key: 'occurred_at', label: 'QUANDO', render: v => fmtDate(v) },
      { key: 'killer_name', label: 'KILLER', render: v => v || '—' },
      { key: 'killer_type', label: 'TIPO', render: v => `<span class="pill">${v}</span>` },
      { key: 'victim_name', label: 'VÍTIMA' },
      { key: 'weapon_name', label: 'ARMA', render: v => v || '—' },
      { key: 'distance_m', label: 'DIST (m)', render: v => v != null ? Math.round(v) : '—' },
      { key: 'is_pvp', label: 'PVP', render: v => v ? '<span class="pill is-err">PVP</span>' : '<span class="pill">PVE</span>' },
    ], d.rows, [
      { label: 'DEL', kind: 'danger', onClick: r => confirmDelete('kill #' + r.id, () => apiDelete('/kills/' + r.id, 'kills')) },
    ]);
    renderPager('kills-pager', 'kills');
  } catch (err) { alert('Erro kills: ' + err.message); }
}

// ---------- sessions ----------
async function loadSessions() {
  const pager = state.pagers.sessions;
  const open = document.getElementById('sessions-open').value;
  const q = new URLSearchParams({ limit: pager.limit, offset: pager.offset });
  if (open) q.set('open', open);
  try {
    const d = await api('GET', '/sessions?' + q);
    pager.total = d.total;
    renderTable('sessions-table', [
      { key: 'connected_at', label: 'INÍCIO', render: v => fmtDate(v) },
      { key: 'disconnected_at', label: 'FIM', render: v => v ? fmtDate(v) : '<span class="pill is-ok">ABERTA</span>' },
      { key: 'player_name', label: 'JOGADOR', render: (v, r) => v || r.player_uid || '—' },
      { key: 'duration_s', label: 'DURAÇÃO', render: v => fmtSeconds(v) },
      { key: 'spawn_point', label: 'SPAWN', render: v => v || '—' },
      { key: 'balance_in', label: 'SALDO IN', render: v => v != null ? v : '—' },
      { key: 'balance_out', label: 'SALDO OUT', render: v => v != null ? v : '—' },
    ], d.rows, []);
    renderPager('sessions-pager', 'sessions');
  } catch (err) { alert('Erro sessions: ' + err.message); }
}

// ---------- shop ----------
async function loadShop() {
  const pager = state.pagers.shop;
  const s = document.getElementById('shop-search').value.trim();
  const p = document.getElementById('shop-purchase').value;
  const q = new URLSearchParams({ limit: pager.limit, offset: pager.offset });
  if (s) q.set('search', s);
  if (p) q.set('is_purchase', p);
  try {
    const d = await api('GET', '/shop_events?' + q);
    pager.total = d.total;
    renderTable('shop-table', [
      { key: 'occurred_at', label: 'QUANDO', render: v => fmtDate(v) },
      { key: 'player_name', label: 'PLAYER' },
      { key: 'item_name', label: 'ITEM' },
      { key: 'quantity', label: 'QTD' },
      { key: 'is_purchase', label: 'AÇÃO', render: v => v ? '<span class="pill is-warn">COMPRA</span>' : '<span class="pill is-ok">VENDA</span>' },
      { key: 'success', label: 'OK', render: v => v ? '<span class="pill is-ok">SIM</span>' : '<span class="pill is-err">NÃO</span>' },
      { key: 'price', label: 'PREÇO' },
      { key: 'balance_after', label: 'SALDO AFTER', render: v => v != null ? v : '—' },
    ], d.rows, [
      { label: 'DEL', kind: 'danger', onClick: r => confirmDelete('shop event #' + r.id, () => apiDelete('/shop_events/' + r.id, 'shop')) },
    ]);
    renderPager('shop-pager', 'shop');
  } catch (err) { alert('Erro shop: ' + err.message); }
}

// ---------- bounty ----------
async function loadBounty() {
  const pager = state.pagers.bounty;
  try {
    const settings = await api('GET', '/bounty/settings');
    document.getElementById('bounty-enabled').checked = !!settings.enabled;
    document.getElementById('bounty-min-kills').value = settings.min_kills ?? 5;
    document.getElementById('bounty-base-value').value = settings.base_value ?? 5000;
    document.getElementById('bounty-increase-pct').value = settings.increase_pct ?? 20;

    const claimed = document.getElementById('bounty-claimed').value;
    const q = new URLSearchParams({ limit: pager.limit, offset: pager.offset });
    if (claimed) q.set('claimed', claimed);
    const d = await api('GET', '/bounty/rewards?' + q);
    pager.total = d.total;
    renderTable('bounty-table', [
      { key: 'occurred_at', label: 'QUANDO', render: v => fmtDate(v) },
      { key: 'hunter_name', label: 'CACADOR' },
      { key: 'target_name', label: 'ALVO' },
      { key: 'target_streak', label: 'SEQ ALVO' },
      { key: 'bounty_value', label: 'VALOR', render: v => formatBRL(v) },
      { key: 'duration_s', label: 'TEMPO', render: v => v == null ? 'â€”' : fmtSeconds(v) },
      { key: 'claimed', label: 'STATUS', render: v => v ? '<span class="pill is-ok">PAGO</span>' : '<span class="pill is-warn">PENDENTE</span>' },
      { key: 'claimed_at', label: 'PAGO EM', render: v => v ? fmtDate(v) : '—' },
    ], d.rows, []);
    renderPager('bounty-pager', 'bounty');
  } catch (err) {
    alert('Erro bounty: ' + err.message);
  }
}

async function saveBountySettings() {
  const status = document.getElementById('bounty-status');
  status.textContent = 'Salvando...';
  try {
    const body = {
      enabled: document.getElementById('bounty-enabled').checked,
      min_kills: Number(document.getElementById('bounty-min-kills').value),
      base_value: Number(document.getElementById('bounty-base-value').value),
      increase_pct: Number(document.getElementById('bounty-increase-pct').value),
    };
    await api('PATCH', '/bounty/settings', body);
    status.textContent = 'Config salva.';
    setTimeout(() => { if (status.textContent === 'Config salva.') status.textContent = ''; }, 2500);
    loadBounty();
  } catch (err) {
    status.textContent = 'Erro: ' + err.message;
  }
}

// ---------- missions ----------
async function loadMissions() {
  const pager = state.pagers.missions;
  const s = document.getElementById('missions-search').value.trim();
  const a = document.getElementById('missions-active').value;
  const q = new URLSearchParams({ limit: pager.limit, offset: pager.offset });
  if (s) q.set('search', s);
  if (a) q.set('active', a);
  try {
    const d = await api('GET', '/missions?' + q);
    pager.total = d.total;
    renderTable('missions-table', [
      { key: 'started_at', label: 'INÍCIO', render: v => fmtDate(v) },
      { key: 'ended_at', label: 'FIM', render: v => v ? fmtDate(v) : '<span class="pill is-ok">ATIVA</span>' },
      { key: 'sub_idx', label: 'SUB IDX' },
      { key: 'mission_name', label: 'NOME' },
      { key: 'won', label: 'VENCEU', render: v => v == null ? '—' : (v ? '<span class="pill is-ok">SIM</span>' : '<span class="pill is-err">NÃO</span>') },
      { key: 'cooldown_s', label: 'COOLDOWN', render: v => fmtSeconds(v) },
    ], d.rows, [
      { label: 'DEL', kind: 'danger', onClick: r => confirmDelete('missão #' + r.id, () => apiDelete('/missions/' + r.id, 'missions')) },
    ]);
    renderPager('missions-pager', 'missions');
  } catch (err) { alert('Erro missões: ' + err.message); }
}

// ---------- events_raw ----------
async function loadEvents() {
  const pager = state.pagers.events;
  const t = document.getElementById('events-type').value;
  const p = document.getElementById('events-processed').value;
  const e = document.getElementById('events-error').value;
  const q = new URLSearchParams({ limit: pager.limit, offset: pager.offset });
  if (t) q.set('type', t);
  if (p) q.set('processed', p);
  if (e) q.set('has_error', e);
  try {
    const d = await api('GET', '/events?' + q);
    pager.total = d.total;
    renderTable('events-table', [
      { key: 'received_at', label: 'RECEBIDO', render: v => fmtDate(v) },
      { key: 'event_type', label: 'TIPO' },
      { key: 'server_id', label: 'SERVER' },
      { key: 'processed', label: 'PROC', render: v => v ? '<span class="pill is-ok">SIM</span>' : '<span class="pill is-warn">NÃO</span>' },
      { key: 'error', label: 'ERRO', render: v => v ? `<span class="pill is-err">${escapeHtml(v).slice(0,40)}</span>` : '—' },
    ], d.rows, [
      { label: 'JSON', onClick: r => showJson('Event #' + r.id, r.payload) },
      { label: 'DEL', kind: 'danger', onClick: r => confirmDelete('evento raw #' + r.id, () => apiDelete('/events/' + r.id, 'events')) },
    ]);
    renderPager('events-pager', 'events');
  } catch (err) { alert('Erro events: ' + err.message); }
}

async function purgeOldEvents() {
  confirmAction('Purgar eventos raw com mais de 30 dias?', async () => {
    try {
      const r = await api('POST', '/events/purge', { days: 30 });
      alert('Removidos: ' + r.deleted_count);
      loadEvents();
    } catch (err) { alert('Erro purga: ' + err.message); }
  });
}

// ---------- shared rendering ----------
function renderTable(tableId, cols, rows, actions) {
  const t = document.getElementById(tableId);
  if (!rows.length) {
    t.innerHTML = '<tbody><tr><td style="padding:18px;color:var(--text-muted)">Nenhum registro.</td></tr></tbody>';
    return;
  }
  const head = '<thead><tr>' +
    cols.map(c => `<th>${c.label}</th>`).join('') +
    (actions?.length ? '<th class="col-actions">AÇÕES</th>' : '') +
    '</tr></thead>';
  const body = '<tbody>' + rows.map((r, i) => {
    const cells = cols.map(c => {
      const v = r[c.key];
      const out = c.render ? c.render(v, r) : (v == null ? '—' : escapeHtml(String(v)));
      return `<td>${out}</td>`;
    }).join('');
    const actCell = actions?.length
      ? '<td class="col-actions">' + actions.map((a, j) =>
          `<button class="row-btn ${a.kind === 'danger' ? 'is-danger' : ''}" data-row="${i}" data-act="${j}">${a.label}</button>`
        ).join('') + '</td>'
      : '';
    return `<tr>${cells}${actCell}</tr>`;
  }).join('') + '</tbody>';
  t.innerHTML = head + body;
  if (actions?.length) {
    t.querySelectorAll('.row-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.row);
        const j = Number(btn.dataset.act);
        actions[j].onClick(rows[i]);
      });
    });
  }
}

function renderPager(elId, key) {
  const p = state.pagers[key];
  const from = p.total ? p.offset + 1 : 0;
  const to = Math.min(p.offset + p.limit, p.total);
  const prevDisabled = p.offset <= 0 ? 'disabled' : '';
  const nextDisabled = (p.offset + p.limit) >= p.total ? 'disabled' : '';
  const el = document.getElementById(elId);
  el.innerHTML = `
    <span>${from}–${to} de ${p.total}</span>
    <button class="btn-ghost" ${prevDisabled} data-pager-prev>&laquo; ANT</button>
    <button class="btn-ghost" ${nextDisabled} data-pager-next>PRÓX &raquo;</button>
  `;
  el.querySelector('[data-pager-prev]')?.addEventListener('click', () => {
    p.offset = Math.max(0, p.offset - p.limit);
    refreshTab(state.current);
  });
  el.querySelector('[data-pager-next]')?.addEventListener('click', () => {
    p.offset += p.limit;
    refreshTab(state.current);
  });
}

// ---------- delete helper ----------
async function apiDelete(path, tab) {
  try {
    await api('DELETE', path);
    refreshTab(tab);
  } catch (err) { alert('Falha ao deletar: ' + err.message); }
}

// ---------- modals ----------
function confirmDelete(target, onConfirm) {
  confirmAction(`Deletar ${target}? Esta ação é permanente.`, onConfirm);
}
function confirmAction(message, onConfirm) {
  showModal('Confirmar', message, [
    { label: 'CANCELAR', kind: 'ghost', onClick: hideModal },
    { label: 'CONFIRMAR', kind: 'danger', onClick: () => { hideModal(); onConfirm(); } },
  ]);
}
function showJson(title, data) {
  showModal(title, JSON.stringify(data, null, 2), [
    { label: 'FECHAR', kind: 'ghost', onClick: hideModal },
  ]);
}
function showModal(title, body, buttons) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = body;
  const foot = document.getElementById('modal-foot');
  foot.innerHTML = '';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.className = b.kind === 'danger' ? 'btn-danger' : 'btn-ghost';
    btn.textContent = b.label;
    btn.addEventListener('click', b.onClick);
    foot.appendChild(btn);
  }
  document.getElementById('modal').classList.remove('hidden');
}
function hideModal() { document.getElementById('modal').classList.add('hidden'); }

// ---------- format helpers ----------
function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { hour12: false });
}
function fmtSeconds(s) {
  const n = Number(s) || 0;
  if (n <= 0) return '—';
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const sec = n % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
function formatBRL(n) {
  return 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatUptime(s) {
  return fmtSeconds(s);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
}

// ---------- bootstrap ----------
function bindUI() {
  document.getElementById('login-form').addEventListener('submit', doLogin);
  document.getElementById('btn-logout').addEventListener('click', doLogout);
  document.getElementById('modal-cancel').addEventListener('click', hideModal);
  for (const btn of document.querySelectorAll('.tab')) {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  }
  for (const btn of document.querySelectorAll('[data-refresh]')) {
    btn.addEventListener('click', () => {
      state.pagers[btn.dataset.refresh].offset = 0;
      refreshTab(btn.dataset.refresh);
    });
  }
  // Search filters refresh on Enter or change.
  for (const id of ['players-search', 'kills-search', 'shop-search', 'missions-search']) {
    document.getElementById(id).addEventListener('change', () => switchTab(state.current));
  }
  for (const id of ['players-banned', 'kills-type', 'sessions-open', 'shop-purchase', 'bounty-claimed', 'missions-active', 'events-type', 'events-processed', 'events-error']) {
    document.getElementById(id).addEventListener('change', () => switchTab(state.current));
  }
  document.getElementById('bounty-save').addEventListener('click', saveBountySettings);
  document.getElementById('events-purge').addEventListener('click', purgeOldEvents);
}

bindUI();
checkAuth();
