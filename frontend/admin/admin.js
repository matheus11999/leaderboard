'use strict';

// ===================================================================
// BrasilZ Admin Panel — vanilla JS SPA hitting /api/admin/*.
// JWT is set as httpOnly cookie by the backend on login, so requests
// here just rely on credentials: same-origin.
// ===================================================================

const API_BASE = '/api/admin';
const DEFAULT_SERVER_ID = 'brasilz-main';

const state = {
  user: null,
  current: 'overview',
  servers: [],
  selectedServer: DEFAULT_SERVER_ID,
  loaded: {},
  pending: 0,
  lastOkAt: null,
  pagers: {
    servers:  { offset: 0, limit: 500, total: 0 },
    players:  { offset: 0, limit: 50, total: 0 },
    kills:    { offset: 0, limit: 50, total: 0 },
    sessions: { offset: 0, limit: 50, total: 0 },
    shop:     { offset: 0, limit: 50, total: 0 },
    bounty:   { offset: 0, limit: 50, total: 0 },
    payments: { offset: 0, limit: 50, total: 0 },
    admins:   { offset: 0, limit: 500, total: 0 },
    missions: { offset: 0, limit: 50, total: 0 },
    events:   { offset: 0, limit: 100, total: 0 },
  },
};

// ---------- HTTP helpers ----------
async function api(method, path, body) {
  setBusy(true);
  const opts = {
    method,
    credentials: 'same-origin',
    headers: { 'Accept': 'application/json' },
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  try {
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
    setBusy(false, true);
    return data;
  } catch (err) {
    setBusy(false, false);
    throw err;
  }
}

function withServer(path) {
  const sep = path.includes('?') ? '&' : '?';
  return path + sep + 'server_id=' + encodeURIComponent(state.selectedServer);
}

// ---------- screens ----------
function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('dashboard').classList.add('hidden');
}
function showDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  loadServers().then(() => switchTab(state.current)).catch(() => switchTab(state.current));
}

function setBusy(isBusy, ok = null) {
  const el = document.getElementById('app-status');
  if (!el) return;
  state.pending = Math.max(0, state.pending + (isBusy ? 1 : -1));
  el.classList.toggle('is-loading', state.pending > 0);
  el.classList.toggle('is-ok', state.pending === 0 && ok === true);
  el.classList.toggle('is-err', state.pending === 0 && ok === false);
  if (state.pending > 0) {
    el.textContent = 'CARREGANDO';
  } else if (ok === false) {
    el.textContent = 'ERRO';
  } else if (ok === true) {
    state.lastOkAt = new Date();
    el.textContent = 'OK';
    setTimeout(() => {
      if (state.pending === 0 && el.textContent === 'OK') el.textContent = '';
    }, 1800);
  }
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
function switchTab(name, opts = {}) {
  state.current = name;
  for (const btn of document.querySelectorAll('.tab')) btn.classList.toggle('is-active', btn.dataset.tab === name);
  for (const pane of document.querySelectorAll('.tab-pane')) pane.classList.toggle('is-active', pane.id === 'pane-' + name);
  if (opts.force || !state.loaded[name]) refreshTab(name);
}

async function refreshTab(name) {
  try {
    switch (name) {
      case 'overview': await loadOverview(); break;
      case 'servers':  await loadServers(); break;
      case 'players':  await loadPlayers(); break;
      case 'kills':    await loadKills(); break;
      case 'sessions': await loadSessions(); break;
      case 'shop':     await loadShop(); break;
      case 'bounty':   await loadBounty(); break;
      case 'payments': await loadPayments(); break;
      case 'admins':   await loadAdmins(); break;
      case 'missions': await loadMissions(); break;
      case 'events':   await loadEvents(); break;
    }
    state.loaded[name] = true;
  } catch {
    state.loaded[name] = false;
  }
}

function reloadTab(name = state.current) {
  state.loaded[name] = false;
  return refreshTab(name);
}

function invalidateDataTabs() {
  for (const key of Object.keys(state.loaded)) {
    if (key !== 'servers') state.loaded[key] = false;
  }
}

// ---------- overview ----------
async function loadOverview() {
  const container = document.getElementById('overview-stats');
  container.innerHTML = '<div class="stat-card-label">CARREGANDO…</div>';
  try {
    const d = await api('GET', withServer('/overview'));
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
    const d = await api('GET', withServer('/players?' + q));
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
      { key: 'bank_balance', label: 'BANCO', render: v => formatBRL(v || 0) },
      { key: 'is_banned', label: 'BAN', render: v => v ? '<span class="pill is-err">BANIDO</span>' : '<span class="pill is-ok">OK</span>' },
    ], d.rows, [
      { label: 'BANCO', kind: 'warn', onClick: r => showBankModal(r.uid) },
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

async function showBankModal(uid, day = '') {
  try {
    const q = new URLSearchParams({ limit: '100' });
    if (day) q.set('day', day);
    const d = await api('GET', withServer('/players/' + encodeURIComponent(uid) + '/bank?' + q));
    const p = d.player || {};
    const rows = d.transactions || [];
    const serverName = d.selected_server_name || getSelectedServerName();
    const latestTx = rows[0] || null;
    const latestTxTotal = latestTx?.total_balance ?? null;
    const latestTxCash = latestTx?.cash_balance ?? null;
    const lastTxLabel = latestTx ? `${fmtDate(latestTx.occurred_at)} (${fmtRelative(latestTx.occurred_at)})` : 'Sem transacao';
    const txHtml = rows.length ? rows.map(tx => {
      const isDeposit = tx.transaction_type === 'deposit';
      const type = isDeposit ? 'DEPOSITO' : 'RETIRADA';
      const sign = isDeposit ? '+' : '-';
      const cls = isDeposit ? 'is-ok' : 'is-warn';
      return `
        <tr>
          <td>
            <div class="bank-time">${fmtDate(tx.occurred_at)}</div>
            <div class="bank-relative">${fmtRelative(tx.occurred_at)}</div>
          </td>
          <td><span class="pill ${cls}">${type}</span></td>
          <td>${sign}${formatBRL(tx.amount || 0)}</td>
          <td>${formatBRL(tx.bank_before || 0)} -> ${formatBRL(tx.bank_after || 0)}</td>
          <td>${tx.cash_balance == null ? '&mdash;' : formatBRL(tx.cash_balance)}</td>
          <td>${tx.total_balance == null ? '&mdash;' : formatBRL(tx.total_balance)}</td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="6"><div class="table-state">Sem transacoes reais neste servidor/data.</div></td></tr>';

    showHtmlModal('Banco - ' + (p.name || uid), `
      <div class="bank-modal">
        <div class="bank-context">
          <span class="pill is-warn">SERVIDOR: ${escapeHtml(serverName || state.selectedServer)}</span>
          <span class="bank-context-note">O saldo do jogador e global por UID; o extrato abaixo e filtrado pelo servidor selecionado.</span>
        </div>
        <div class="bank-toolbar">
          <label class="field bank-day-field">
            <span class="field-label">FILTRAR POR DIA</span>
            <input id="bank-day-filter" type="date" value="${escapeHtml(day)}">
          </label>
          <button type="button" id="bank-clear-day" class="btn-ghost">TODOS OS DIAS</button>
        </div>
      </div>
      <div class="stats-grid bank-stats">
        <div class="stat-card bank-card-main">
          <div class="stat-card-label">BANCO ATUAL</div>
          <div class="stat-card-value">${formatBRL(p.bank_balance || 0)}</div>
          <div class="stat-card-foot">ultimo dado recebido do jogo</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">INVENTARIO ATUAL</div>
          <div class="stat-card-value">${formatBRL(p.current_balance || 0)}</div>
          <div class="stat-card-foot">global do jogador no portal</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">INV. ULTIMA TRANSACAO</div>
          <div class="stat-card-value">${latestTxCash == null ? '—' : formatBRL(latestTxCash)}</div>
          <div class="stat-card-foot">${escapeHtml(lastTxLabel)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">TOTAL ULT. TRANSACAO</div>
          <div class="stat-card-value">${latestTxTotal == null ? '—' : formatBRL(latestTxTotal)}</div>
          <div class="stat-card-foot">banco + inventario naquele momento</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">ULTIMA ATUALIZACAO</div>
          <div class="stat-card-value">${p.bank_last_seen ? fmtDate(p.bank_last_seen) : 'Sem sync'}</div>
          <div class="stat-card-foot">${p.bank_last_seen ? fmtRelative(p.bank_last_seen) : ''}</div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>HORARIO</th>
              <th>TIPO</th>
              <th>VALOR</th>
              <th>SALDO BANCO</th>
              <th>INVENTARIO</th>
              <th>TOTAL</th>
            </tr>
          </thead>
          <tbody>${txHtml}</tbody>
        </table>
      </div>
    `, [
      { label: 'FECHAR', kind: 'ghost', onClick: hideModal },
    ]);
    document.getElementById('bank-day-filter')?.addEventListener('change', (ev) => {
      showBankModal(uid, ev.target.value || '');
    });
    document.getElementById('bank-clear-day')?.addEventListener('click', () => {
      showBankModal(uid, '');
    });
  } catch (err) {
    alert('Erro banco: ' + err.message);
  }
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
    const d = await api('GET', withServer('/kills?' + q));
    pager.total = d.total;
    renderTable('kills-table', [
      { key: 'occurred_at', label: 'QUANDO', render: v => fmtDate(v) },
      { key: 'server_id', label: 'SERVER' },
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
    const d = await api('GET', withServer('/sessions?' + q));
    pager.total = d.total;
    renderTable('sessions-table', [
      { key: 'connected_at', label: 'INÍCIO', render: v => fmtDate(v) },
      { key: 'server_id', label: 'SERVER' },
      { key: 'online', label: 'STATUS', render: v => v ? '<span class="pill is-ok">ONLINE</span>' : '<span class="pill">OFFLINE</span>' },
      { key: 'disconnected_at', label: 'FIM', render: v => v ? fmtDate(v) : '<span class="pill is-warn">SEM DISCONNECT</span>' },
      { key: 'last_seen', label: 'ATIVIDADE', render: v => fmtDate(v) },
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
    const d = await api('GET', withServer('/shop_events?' + q));
    pager.total = d.total;
    renderTable('shop-table', [
      { key: 'occurred_at', label: 'QUANDO', render: v => fmtDate(v) },
      { key: 'server_id', label: 'SERVER' },
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
    const d = await api('GET', withServer('/bounty/rewards?' + q));
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

// ---------- servers ----------
async function loadServers() {
  const d = await api('GET', '/servers');
  state.servers = d.rows || [];
  ensureSelectedServer();
  renderServerSelects();
  renderTable('servers-table', [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'NOME' },
    { key: 'slug', label: 'PAGINA', render: (_v, r) => `<a href="/server/${encodeURIComponent(r.id)}" target="_blank">${escapeHtml('/server/' + r.id)}</a>` },
    { key: 'public_enabled', label: 'PUBLICO', render: v => v ? '<span class="pill is-ok">SIM</span>' : '<span class="pill">NAO</span>' },
    { key: 'is_default', label: 'PADRAO', render: v => v ? '<span class="pill is-warn">PADRAO</span>' : '<span class="pill">-</span>' },
    { key: 'updated_at', label: 'ATUALIZADO', render: v => fmtDate(v) },
  ], state.servers, [
    { label: 'EDIT', onClick: fillServerForm },
    { label: 'DEL', kind: 'danger', onClick: r => confirmDelete('servidor ' + r.id, () => apiDelete('/servers/' + encodeURIComponent(r.id), 'servers')) },
  ]);
}

function renderServerSelects() {
  const filter = document.getElementById('admin-server-filter');
  if (filter) {
    filter.innerHTML = state.servers.map((s) => {
      const active = s.id === state.selectedServer;
      return `<button type="button" role="tab" aria-selected="${active ? 'true' : 'false'}" class="server-switch-btn ${active ? 'is-active' : ''}" data-server-id="${escapeHtml(s.id)}">${escapeHtml(s.name || s.id)}</button>`;
    }).join('');

    for (const btn of filter.querySelectorAll('.server-switch-btn')) {
      btn.addEventListener('click', () => {
        const next = btn.dataset.serverId || DEFAULT_SERVER_ID;
        if (next === state.selectedServer) return;
        state.selectedServer = next;
        for (const pager of Object.values(state.pagers)) pager.offset = 0;
        invalidateDataTabs();
        renderServerSelects();
        reloadTab(state.current);
      });
    }
  }

  const payment = document.getElementById('payments-server');
  if (payment) {
    const paymentOptions = state.servers.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name || s.id)}</option>`).join('');
    payment.innerHTML = paymentOptions || `<option value="${DEFAULT_SERVER_ID}">${DEFAULT_SERVER_ID}</option>`;
    payment.value = state.selectedServer;
  }
}

function ensureSelectedServer() {
  if (!state.servers.length) {
    state.selectedServer = state.selectedServer || DEFAULT_SERVER_ID;
    return;
  }

  if (state.servers.some((s) => s.id === state.selectedServer)) return;

  const main = state.servers.find((s) => s.id === DEFAULT_SERVER_ID);
  const def = state.servers.find((s) => s.is_default);
  state.selectedServer = (main || def || state.servers[0]).id;
}

function fillServerForm(row) {
  document.getElementById('server-id').value = row.id || '';
  document.getElementById('server-name').value = row.name || '';
  document.getElementById('server-slug').value = row.slug || '';
  document.getElementById('server-public').checked = !!row.public_enabled;
  document.getElementById('server-default').checked = !!row.is_default;
}

async function saveServer() {
  const status = document.getElementById('server-status');
  const id = document.getElementById('server-id').value.trim();
  const body = {
    id,
    name: document.getElementById('server-name').value.trim() || id,
    slug: document.getElementById('server-slug').value.trim() || id,
    public_enabled: document.getElementById('server-public').checked,
    is_default: document.getElementById('server-default').checked,
  };
  if (!id) {
    status.textContent = 'Informe o ID do servidor.';
    return;
  }

  status.textContent = 'Salvando...';
  try {
    await api('POST', '/servers', body);
    status.textContent = 'Servidor salvo.';
    setTimeout(() => { if (status.textContent === 'Servidor salvo.') status.textContent = ''; }, 2500);
    await loadServers();
  } catch (err) {
    status.textContent = 'Erro: ' + err.message;
  }
}

// ---------- manual payments ----------
async function loadPaymentPlayers() {
  const select = document.getElementById('payments-player');
  const search = document.getElementById('payments-player-search').value.trim();
  const serverId = document.getElementById('payments-server')?.value || state.selectedServer || DEFAULT_SERVER_ID;
  const q = new URLSearchParams({ limit: 200 });
  if (search) q.set('search', search);
  q.set('server_id', serverId);

  select.innerHTML = '<option value="">Carregando...</option>';
  select.dataset.serverId = serverId;
  try {
    const d = await api('GET', '/payments/players?' + q);
    const rows = d.rows || [];
    if (!rows.length) {
      select.innerHTML = '<option value="">Nenhum jogador encontrado neste servidor</option>';
      return;
    }
    select.innerHTML = rows.map((p) => {
      const name = escapeHtml(p.name || 'Unknown');
      const uid = escapeHtml(p.uid || '');
      const seen = (p.session_last_seen || p.last_seen) ? fmtDate(p.session_last_seen || p.last_seen) : 'sem data';
      const status = p.online ? 'ONLINE' : 'OFFLINE';
      const cash = p.current_balance != null ? ' | inv ' + formatBRL(p.current_balance) : '';
      const bank = p.bank_balance != null ? ' | banco ' + formatBRL(p.bank_balance) : '';
      return `<option value="${uid}">${name} | ${status} | ${uid.slice(0, 8)} | ${seen}${cash}${bank}</option>`;
    }).join('');
  } catch (err) {
    select.innerHTML = '<option value="">Erro ao carregar jogadores</option>';
    alert('Erro jogadores pagamento: ' + err.message);
  }
}

async function createPayment() {
  const status = document.getElementById('payments-status');
  const playerUid = document.getElementById('payments-player').value;
  const amount = Number(document.getElementById('payments-amount').value);
  const serverId = document.getElementById('payments-server').value.trim() || state.selectedServer || DEFAULT_SERVER_ID;
  const note = document.getElementById('payments-note').value.trim();

  if (!playerUid) {
    status.textContent = 'Selecione um jogador.';
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    status.textContent = 'Informe um valor maior que zero.';
    return;
  }

  status.textContent = 'Criando...';
  try {
    await api('POST', '/payments', {
      player_uid: playerUid,
      amount: Math.round(amount),
      server_id: serverId,
      note,
    });
    document.getElementById('payments-amount').value = '';
    document.getElementById('payments-note').value = '';
    status.textContent = 'Pagamento criado. Vai pagar quando o player estiver online.';
    setTimeout(() => { if (status.textContent.startsWith('Pagamento criado')) status.textContent = ''; }, 3500);
    state.pagers.payments.offset = 0;
    loadPayments();
  } catch (err) {
    status.textContent = 'Erro: ' + err.message;
  }
}

async function loadPayments() {
  const pager = state.pagers.payments;
  const claimed = document.getElementById('payments-claimed').value;
  const search = document.getElementById('payments-search').value.trim();
  const paymentServer = document.getElementById('payments-server')?.value || state.selectedServer || DEFAULT_SERVER_ID;
  const q = new URLSearchParams({ limit: pager.limit, offset: pager.offset, server_id: paymentServer });
  if (claimed) q.set('claimed', claimed);
  if (search) q.set('search', search);

  try {
    const playerSelect = document.getElementById('payments-player');
    if (!playerSelect.options.length || playerSelect.dataset.serverId !== paymentServer) {
      await loadPaymentPlayers();
    }
    const d = await api('GET', '/payments?' + q);
    pager.total = d.total;
    renderTable('payments-table', [
      { key: 'created_at', label: 'CRIADO', render: v => fmtDate(v) },
      { key: 'player_name', label: 'JOGADOR' },
      { key: 'player_uid', label: 'UID', render: v => v || 'â€”' },
      { key: 'amount', label: 'VALOR', render: v => formatBRL(v) },
      { key: 'server_id', label: 'SERVIDOR' },
      { key: 'claimed', label: 'STATUS', render: v => v ? '<span class="pill is-ok">PAGO</span>' : '<span class="pill is-warn">PENDENTE</span>' },
      { key: 'claimed_at', label: 'PAGO EM', render: v => v ? fmtDate(v) : 'â€”' },
      { key: 'note', label: 'OBS', render: v => v ? escapeHtml(v) : 'â€”' },
      { key: 'created_by', label: 'ADMIN', render: v => v || 'â€”' },
    ], d.rows, [
      { label: 'DEL', kind: 'danger', onClick: r => {
        if (r.claimed) return alert('Pagamento ja foi pago e nao pode ser removido.');
        confirmDelete('pagamento #' + r.id, () => apiDelete('/payments/' + r.id, 'payments'));
      } },
    ]);
    renderPager('payments-pager', 'payments');
  } catch (err) {
    alert('Erro pagamentos: ' + err.message);
  }
}

// ---------- admins ----------
async function loadAdmins() {
  try {
    const d = await api('GET', '/admins');
    renderTable('admins-table', [
      { key: 'username', label: 'USUARIO' },
      { key: 'created_at', label: 'CRIADO EM', render: v => fmtDate(v) },
      { key: 'current', label: 'SESSAO', render: (_v, r) => r.username === state.user?.username ? '<span class="pill is-ok">VOCE</span>' : '<span class="pill">ADMIN</span>' },
    ], d.rows || [], [
      { label: 'EDIT', onClick: fillAdminForm },
      { label: 'DEL', kind: 'danger', onClick: r => {
        if (r.username === state.user?.username) return alert('Voce nao pode remover o admin que esta logado.');
        confirmDelete('admin ' + r.username, () => apiDelete('/admins/' + encodeURIComponent(r.username), 'admins'));
      } },
    ]);
  } catch (err) {
    alert('Erro admins: ' + err.message);
  }
}

function clearAdminForm() {
  document.getElementById('admin-original-username').value = '';
  document.getElementById('admin-username').value = '';
  document.getElementById('admin-password').value = '';
  document.getElementById('admin-password-confirm').value = '';
  document.getElementById('admin-status').textContent = '';
}

function fillAdminForm(row) {
  document.getElementById('admin-original-username').value = row.username || '';
  document.getElementById('admin-username').value = row.username || '';
  document.getElementById('admin-password').value = '';
  document.getElementById('admin-password-confirm').value = '';
  document.getElementById('admin-status').textContent = 'Editando admin existente. Informe nova senha somente se quiser trocar.';
}

async function saveAdmin() {
  const status = document.getElementById('admin-status');
  const original = document.getElementById('admin-original-username').value.trim();
  const username = document.getElementById('admin-username').value.trim();
  const password = document.getElementById('admin-password').value;
  const confirm = document.getElementById('admin-password-confirm').value;

  if (!username) {
    status.textContent = 'Informe o usuario.';
    return;
  }
  if (password !== confirm) {
    status.textContent = 'As senhas nao conferem.';
    return;
  }
  if (!original && password.length < 8) {
    status.textContent = 'Para criar admin, informe senha com minimo 8 caracteres.';
    return;
  }

  status.textContent = 'Salvando...';
  try {
    const body = { username };
    if (password) body.password = password;
    if (original) {
      await api('PATCH', '/admins/' + encodeURIComponent(original), body);
    } else {
      await api('POST', '/admins', body);
    }
    clearAdminForm();
    status.textContent = 'Admin salvo.';
    setTimeout(() => { if (status.textContent === 'Admin salvo.') status.textContent = ''; }, 2500);
    await loadAdmins();
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
    const d = await api('GET', withServer('/missions?' + q));
    pager.total = d.total;
    renderTable('missions-table', [
      { key: 'started_at', label: 'INÍCIO', render: v => fmtDate(v) },
      { key: 'server_id', label: 'SERVER' },
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
    const d = await api('GET', withServer('/events?' + q));
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
    t.innerHTML = '<tbody><tr><td><div class="table-state">Nenhum registro para este filtro.</div></td></tr></tbody>';
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
    reloadTab(state.current);
  });
  el.querySelector('[data-pager-next]')?.addEventListener('click', () => {
    p.offset += p.limit;
    reloadTab(state.current);
  });
}

// ---------- delete helper ----------
async function apiDelete(path, tab) {
  try {
    await api('DELETE', path);
    reloadTab(tab);
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
  renderModalButtons(buttons);
  document.getElementById('modal').classList.remove('hidden');
}
function showHtmlModal(title, bodyHtml, buttons) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  renderModalButtons(buttons);
  document.getElementById('modal').classList.remove('hidden');
}
function renderModalButtons(buttons) {
  const foot = document.getElementById('modal-foot');
  foot.innerHTML = '';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.className = b.kind === 'danger' ? 'btn-danger' : 'btn-ghost';
    btn.textContent = b.label;
    btn.addEventListener('click', b.onClick);
    foot.appendChild(btn);
  }
}
function hideModal() { document.getElementById('modal').classList.add('hidden'); }

// ---------- format helpers ----------
function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { hour12: false });
}
function fmtRelative(s) {
  if (!s) return 'agora';
  const d = new Date(s);
  if (isNaN(d.getTime())) return 'agora';
  const diff = Math.max(0, Date.now() - d.getTime());
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hours = Math.floor(min / 60);
  const days = Math.floor(hours / 24);
  if (sec < 45) return 'agora mesmo';
  if (min < 60) return `${min} min atras`;
  if (hours < 24) return `${hours}h atras`;
  if (days < 30) return `${days}d atras`;
  return fmtDate(s);
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
function getSelectedServerName() {
  const server = state.servers.find(s => s.id === state.selectedServer);
  return server?.name || state.selectedServer;
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
      if (state.pagers[btn.dataset.refresh]) state.pagers[btn.dataset.refresh].offset = 0;
      reloadTab(btn.dataset.refresh);
    });
  }
  // Search filters refresh on Enter or change.
  for (const id of ['players-search', 'kills-search', 'shop-search', 'payments-search', 'missions-search']) {
    document.getElementById(id).addEventListener('change', () => {
      state.pagers[state.current].offset = 0;
      reloadTab(state.current);
    });
  }
  document.getElementById('server-save').addEventListener('click', saveServer);
  for (const id of ['players-banned', 'kills-type', 'sessions-open', 'shop-purchase', 'bounty-claimed', 'payments-claimed', 'missions-active', 'events-type', 'events-processed', 'events-error']) {
    document.getElementById(id).addEventListener('change', () => {
      state.pagers[state.current].offset = 0;
      reloadTab(state.current);
    });
  }
  document.getElementById('bounty-save').addEventListener('click', saveBountySettings);
  document.getElementById('payments-player-refresh').addEventListener('click', loadPaymentPlayers);
  document.getElementById('payments-player-search').addEventListener('change', loadPaymentPlayers);
  document.getElementById('payments-server').addEventListener('change', () => {
    state.pagers.payments.offset = 0;
    state.loaded.payments = false;
    loadPaymentPlayers();
    loadPayments();
  });
  document.getElementById('payments-create').addEventListener('click', createPayment);
  document.getElementById('admin-save').addEventListener('click', saveAdmin);
  document.getElementById('admin-clear').addEventListener('click', clearAdminForm);
  document.getElementById('events-purge').addEventListener('click', purgeOldEvents);
}

bindUI();
checkAuth();
