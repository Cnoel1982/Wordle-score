import { parseShare, puzzleForDate, dateForPuzzle, points } from './parse.js';

const FIREBASE_VERSION = '10.12.2';
const SETTINGS = window.WORDLE_SHOWDOWN || {};
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');

const DEFAULT_CONFIG = {
  teams: {
    a: { name: 'Boys', emoji: '🦖' },
    b: { name: 'Girls', emoji: '🦄' },
  },
  players: [
    { id: 'p1', name: 'Dad', emoji: '😎', team: 'a' },
    { id: 'p2', name: 'Son', emoji: '🤠', team: 'a' },
    { id: 'p3', name: 'Mom', emoji: '🌸', team: 'b' },
    { id: 'p4', name: 'Daughter', emoji: '✨', team: 'b' },
  ],
  failScore: 7,
};

const SCORE_LINES = {
  1: ['HOLE IN ONE?! 🤯', 'Are you a wizard? 🧙'],
  2: ['Genius! 🧠', 'Two?! Show-off. 😤'],
  3: ['Magnificent ✨', 'Three and done. 🔥'],
  4: ['Impressive 👏', 'Solid four. 💪'],
  5: ['Great 😅', 'Got there!'],
  6: ['Phew! 😮‍💨', 'Clutch save! 🧯'],
  X: ['Oof. 💀', 'The word won today. 🪦'],
};

// ---------- tiny utils ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmtDate = (d, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => d.toLocaleDateString(undefined, opts);
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// ---------- storage backends ----------
function makeLocalBackend() {
  const cfgListeners = new Set();
  const scoreListeners = new Set();
  const readScores = () => store.get('ws.scores', {});
  return {
    kind: 'local',
    onConfig(cb) { cfgListeners.add(cb); cb(store.get('ws.config')); },
    async saveConfig(c) { store.set('ws.config', c); cfgListeners.forEach((cb) => cb(c)); },
    onScores(cb) { scoreListeners.add(cb); cb(Object.values(readScores())); },
    async putScore(s) {
      const all = readScores(); all[`${s.puzzle}_${s.playerId}`] = s; store.set('ws.scores', all);
      scoreListeners.forEach((cb) => cb(Object.values(all)));
    },
    async deleteScore(puzzle, playerId) {
      const all = readScores(); delete all[`${puzzle}_${playerId}`]; store.set('ws.scores', all);
      scoreListeners.forEach((cb) => cb(Object.values(all)));
    },
  };
}

async function makeFirebaseBackend(fbConfig, family) {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const { initializeApp } = await import(`${base}/firebase-app.js`);
  const fs = await import(`${base}/firebase-firestore.js`);
  const db = fs.getFirestore(initializeApp(fbConfig));
  const famRef = fs.doc(db, 'families', family);
  const scoresRef = fs.collection(famRef, 'scores');
  return {
    kind: 'cloud',
    onConfig(cb) { fs.onSnapshot(famRef, (s) => cb(s.exists() ? s.data() : null), (e) => fail(e)); },
    saveConfig: (c) => fs.setDoc(famRef, c),
    onScores(cb) { fs.onSnapshot(scoresRef, (qs) => cb(qs.docs.map((d) => d.data())), (e) => fail(e)); },
    putScore: (s) => fs.setDoc(fs.doc(scoresRef, `${s.puzzle}_${s.playerId}`), s),
    deleteScore: (p, pid) => fs.deleteDoc(fs.doc(scoresRef, `${p}_${pid}`)),
  };
}

function fail(err) {
  console.error(err);
  toast(`Couldn't reach the scoreboard: ${err.code || err.message}`);
}

// ---------- state ----------
const state = {
  backend: null,
  config: null,
  scores: new Map(), // key `${puzzle}_${playerId}` -> score doc
  tab: 'today',
  viewPuzzle: puzzleForDate(),
  me: store.get('ws.me'),
  postAs: null,
  draft: '',
};

const key = (p, pid) => `${p}_${pid}`;
const today = () => puzzleForDate();
const player = (id) => state.config.players.find((p) => p.id === id);
const teamOf = (t) => state.config.teams[t];

// ---------- scoring ----------
function dayResult(puzzle) {
  const cfg = state.config;
  const fs = Number(cfg.failScore) || 7;
  const past = puzzle < today();
  const res = { puzzle, past, teams: { a: { total: 0, rows: [] }, b: { total: 0, rows: [] } }, missing: [], posted: 0 };
  for (const pl of cfg.players) {
    const s = state.scores.get(key(puzzle, pl.id));
    const row = { player: pl, score: s ? s.score : null, entry: s || null };
    if (s) { res.posted++; res.teams[pl.team].total += points(s.score, fs); }
    else { res.missing.push(pl); if (past) res.teams[pl.team].total += fs; }
    res.teams[pl.team].rows.push(row);
  }
  res.empty = res.posted === 0;
  res.complete = res.missing.length === 0;
  res.final = !res.empty && (res.complete || past);
  if (res.final) {
    const { a, b } = res.teams;
    res.winner = a.total < b.total ? 'a' : b.total < a.total ? 'b' : 'tie';
    res.margin = Math.abs(a.total - b.total);
  }
  return res;
}

function allFinalDays() {
  const puzzles = new Set();
  for (const s of state.scores.values()) puzzles.add(s.puzzle);
  return [...puzzles].sort((x, y) => y - x).map(dayResult).filter((r) => r.final);
}

function trashTalk(r) {
  if (r.winner === 'tie') return pick(["Dead even. Nobody sleeps tonight. 😤", "A tie?! Rematch tomorrow.", "Perfectly balanced. 🤝"]);
  const w = teamOf(r.winner).name;
  if (r.margin === 1) return pick([`${w} squeak it out by ONE. 😬`, `Photo finish — ${w} by a whisker!`]);
  if (r.margin <= 3) return pick([`${w} take it. Solid work. 💪`, `${w} win by ${r.margin}. Respect.`]);
  return pick([`${w} by ${r.margin}. Absolute demolition. 💥`, `${w} won by ${r.margin}. Somebody call for help. 🚑`]);
}

// ---------- rendering ----------
function render() {
  if (!state.config) return renderSetup();
  if (!state.me || !player(state.me)) return renderWhoAmI();
  $('#tabs').hidden = false;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  const me = player(state.me);
  $('#whoBtn').textContent = `${me.emoji} ${me.name}`;
  ({ today: renderToday, standings: renderStandings, history: renderHistory, settings: renderSettings })[state.tab]();
}

function chip(row, past, fs) {
  if (row.score != null) return `<span class="chip s${row.score}">${row.score}</span>`;
  if (past) return `<span class="chip dnf" title="Didn't play — counts as ${fs}">DNF</span>`;
  return `<span class="chip wait">…</span>`;
}

function teamPanel(r, t) {
  const team = teamOf(t);
  const fs = Number(state.config.failScore) || 7;
  const cls = r.final && r.winner !== 'tie' ? (r.winner === t ? 'winner' : 'loser') : '';
  return `<div class="team ${t} ${cls}">
    ${cls === 'winner' ? '<div class="crown">👑</div>' : ''}
    <div class="tname">${esc(team.emoji)} ${esc(team.name)}</div>
    <div class="total">${r.empty ? '–' : r.teams[t].total}</div>
    <div class="plist">${r.teams[t].rows.map((row) => `
      <div class="prow"><span>${esc(row.player.emoji)} ${esc(row.player.name)}</span>${chip(row, r.past, fs)}</div>`).join('')}
    </div>
  </div>`;
}

function gridHtml(grid) {
  if (!grid || !grid.length) return '<div class="muted small">(no grid)</div>';
  return `<div class="grid">${grid.map((row) => [...row].map((c) => `<div class="tile ${c}"></div>`).join('')).join('')}</div>`;
}

function badgeFor(row, r) {
  if (row.score === 1) return '🎯 Hole in one';
  if (row.score === 'X') return '💀 Wiped out';
  const posted = [...r.teams.a.rows, ...r.teams.b.rows].filter((x) => x.score != null);
  const best = Math.min(...posted.map((x) => points(x.score)));
  if (r.final && posted.length > 1 && points(row.score) === best) return '⭐ Daily MVP';
  if (row.score === 6) return '🧯 Clutch';
  if (row.entry?.hard) return '🔒 Hard mode';
  return '';
}

function renderToday() {
  const p = state.viewPuzzle;
  const r = dayResult(p);
  const isToday = p === today();
  const iPosted = state.scores.has(key(p, state.me));
  let status;
  if (r.final) {
    status = r.winner === 'tie'
      ? `🤝 <b>Tie game</b> at ${r.teams.a.total}. ${esc(trashTalk(r))}`
      : `👑 <b>${esc(teamOf(r.winner).name)} win!</b> ${esc(trashTalk(r))}`;
  } else if (r.empty) {
    status = isToday ? 'No scores yet today. Who’s going first? 👀' : 'Nobody played this one.';
  } else {
    status = `Waiting on ${r.missing.map((m) => esc(m.name)).join(', ')}…`;
  }
  const players = state.config.players;
  const postAs = state.postAs && player(state.postAs) ? state.postAs : state.me;

  app.innerHTML = `
    <div class="daynav">
      <button class="navbtn" data-nav="-1" aria-label="Previous day">‹</button>
      <div class="title"><b>Wordle #${p.toLocaleString()}</b><span class="muted small">${isToday ? 'Today · ' : ''}${fmtDate(dateForPuzzle(p))}</span></div>
      <button class="navbtn" data-nav="1" aria-label="Next day" ${p >= today() ? 'disabled' : ''}>›</button>
    </div>

    <section class="card">
      <div class="versus">${teamPanel(r, 'a')}<div class="vs">VS</div>${teamPanel(r, 'b')}</div>
      <div class="status">${status}</div>
    </section>

    <section class="card">
      <h2>📋 Post a score</h2>
      <div class="postas">
        <span class="muted small">Posting as</span>
        <select id="postAs">${players.map((pl) => `<option value="${esc(pl.id)}" ${pl.id === postAs ? 'selected' : ''}>${esc(pl.emoji)} ${esc(pl.name)}</option>`).join('')}</select>
      </div>
      <textarea id="paste" placeholder="In Wordle, tap Share → Copy, then paste here.&#10;&#10;Wordle 1,938 4/6&#10;⬜🟨⬜⬜⬜&#10;…">${esc(state.draft)}</textarea>
      <div id="preview" class="preview"></div>
      <div class="row">
        <button class="btn" id="clipBtn" type="button">📋 Paste from clipboard</button>
        <button class="btn primary" id="postBtn" type="button" disabled>Post score</button>
      </div>
    </section>

    <section class="card">
      <h2>🟩 The grids</h2>
      <div class="grids">${players.map((pl) => {
        const s = state.scores.get(key(p, pl.id));
        if (!s) return `<div class="gcard"><div class="gname">${esc(pl.emoji)} ${esc(pl.name)}</div><div class="muted small">${r.past ? 'Didn’t play' : 'Not yet…'}</div></div>`;
        const hide = isToday && !iPosted && pl.id !== state.me;
        const row = [...r.teams.a.rows, ...r.teams.b.rows].find((x) => x.player.id === pl.id);
        return `<div class="gcard ${hide ? 'spoiler' : ''}">
          <button class="del" data-del="${esc(pl.id)}" title="Remove this score">✕</button>
          <div class="gname">${esc(pl.emoji)} ${esc(pl.name)} · ${s.score}/6${s.hard ? '*' : ''}</div>
          ${gridHtml(s.grid)}
          <div class="badge">${hide ? '' : esc(badgeFor(row, r))}</div>
        </div>`;
      }).join('')}</div>
    </section>`;

  app.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => { state.viewPuzzle = Math.min(today(), p + Number(b.dataset.nav)); render(); });
  $('#postAs').onchange = (e) => { state.postAs = e.target.value; };
  const ta = $('#paste');
  ta.oninput = () => { state.draft = ta.value; updatePreview(); };
  $('#clipBtn').onclick = async () => {
    try { ta.value = await navigator.clipboard.readText(); state.draft = ta.value; updatePreview(); }
    catch { toast('Clipboard blocked — long-press the box and choose Paste.'); ta.focus(); }
  };
  $('#postBtn').onclick = postScore;
  app.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    const pl = player(b.dataset.del);
    if (!confirm(`Remove ${pl.name}'s score for #${p}?`)) return;
    await state.backend.deleteScore(p, pl.id).catch(fail);
  });
  updatePreview();
}

function updatePreview() {
  const el = $('#preview'); const btn = $('#postBtn');
  if (!el) return;
  const text = state.draft.trim();
  if (!text) { el.textContent = ''; el.className = 'preview'; btn.disabled = true; return; }
  const parsed = parseShare(text);
  if (!parsed) { el.textContent = "Hmm, that doesn't look like a Wordle share. It should start with “Wordle 1,938 4/6”."; el.className = 'preview bad'; btn.disabled = true; return; }
  const t = today();
  let note = `Got it: #${parsed.puzzle.toLocaleString()} — ${parsed.score}/6${parsed.hard ? ' (hard mode)' : ''}`;
  if (parsed.puzzle > t + 1) note += ' ⚠️ that puzzle is in the future?';
  else if (parsed.puzzle !== t) note += ` (${fmtDate(dateForPuzzle(parsed.puzzle))})`;
  el.textContent = note; el.className = 'preview ok'; btn.disabled = false;
}

async function postScore() {
  const parsed = parseShare(state.draft);
  if (!parsed) return;
  const playerId = $('#postAs').value;
  const pl = player(playerId);
  const existing = state.scores.get(key(parsed.puzzle, playerId));
  if (existing && !confirm(`${pl.name} already has ${existing.score}/6 for #${parsed.puzzle}. Replace it?`)) return;
  const doc = { ...parsed, playerId, postedAt: Date.now() };
  $('#postBtn').disabled = true;
  try {
    await state.backend.putScore(doc);
  } catch (e) { fail(e); $('#postBtn').disabled = false; return; }
  state.draft = '';
  state.viewPuzzle = parsed.puzzle;
  toast(`${pl.emoji} ${pl.name}: ${pick(SCORE_LINES[parsed.score])}`);
  render();
}

function renderStandings() {
  const days = allFinalDays();
  const { teams } = state.config;
  const fs = Number(state.config.failScore) || 7;
  if (!days.length) {
    app.innerHTML = `<section class="card center"><h2>🏆 Standings</h2><p class="muted">No finished days yet. Once both teams have posted, the scoreboard lights up.</p></section>`;
    return;
  }
  const count = (list) => ({ a: list.filter((d) => d.winner === 'a').length, b: list.filter((d) => d.winner === 'b').length, tie: list.filter((d) => d.winner === 'tie').length });
  const all = count(days);

  // Current streak: consecutive wins by one team, newest first.
  let streak = 0, streakTeam = null;
  for (const d of days) {
    if (d.winner === 'tie') break;
    if (!streakTeam) streakTeam = d.winner;
    if (d.winner !== streakTeam) break;
    streak++;
  }
  // Longest streak ever.
  let best = { n: 0, t: null }, run = 0, runT = null;
  for (const d of [...days].reverse()) {
    if (d.winner !== 'tie' && d.winner === runT) run++; else { run = d.winner === 'tie' ? 0 : 1; runT = d.winner === 'tie' ? null : d.winner; }
    if (run > best.n) best = { n: run, t: runT };
  }

  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const week = count(days.filter((d) => d.puzzle >= puzzleForDate(monday)));
  const month = count(days.filter((d) => d.puzzle >= puzzleForDate(new Date(now.getFullYear(), now.getMonth(), 1))));
  const rec = (c) => `${c.a}–${c.b}${c.tie ? ` <span class="muted">(${c.tie}T)</span>` : ''}`;

  // Per-player stats.
  const pstats = state.config.players.map((pl) => {
    const mine = [...state.scores.values()].filter((s) => s.playerId === pl.id);
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, X: 0 };
    mine.forEach((s) => dist[s.score]++);
    const avg = mine.length ? mine.reduce((t, s) => t + points(s.score, fs), 0) / mine.length : null;
    let mvp = 0;
    for (const d of days) {
      const posted = [...d.teams.a.rows, ...d.teams.b.rows].filter((x) => x.score != null);
      const me = posted.find((x) => x.player.id === pl.id);
      if (me && posted.length > 1 && points(me.score, fs) === Math.min(...posted.map((x) => points(x.score, fs)))) mvp++;
    }
    return { pl, n: mine.length, avg, dist, mvp };
  });
  const ranked = pstats.filter((s) => s.n).sort((x, y) => x.avg - y.avg);

  const recent = days.slice(0, 14);
  const maxMargin = Math.max(1, ...recent.map((d) => d.margin));

  app.innerHTML = `
    <section class="card">
      <h2>🏆 All-time</h2>
      <div class="bigrecord">
        <div class="a"><div class="n">${all.a}</div>${esc(teams.a.emoji)} ${esc(teams.a.name)}</div>
        <div class="dash">–</div>
        <div class="b"><div class="n">${all.b}</div>${esc(teams.b.emoji)} ${esc(teams.b.name)}</div>
      </div>
      <p class="center muted small">${all.tie} tie${all.tie === 1 ? '' : 's'} · ${days.length} days played</p>
      <div class="statrow">
        <div class="stat"><b>${streak ? `${esc(teamOf(streakTeam).emoji)} ${streak}` : '–'}</b><span>Current streak</span></div>
        <div class="stat"><b>${rec(week)}</b><span>This week</span></div>
        <div class="stat"><b>${rec(month)}</b><span>This month</span></div>
      </div>
      ${best.n > 1 ? `<p class="center muted small">Longest streak ever: ${esc(teamOf(best.t).name)} with ${best.n} in a row</p>` : ''}
    </section>

    <section class="card">
      <h2>📈 Last ${recent.length} days</h2>
      <div class="trend">${recent.map((d) => d.winner === 'tie'
        ? `<div class="trow"><div class="tie">#${d.puzzle} · tie 🤝</div></div>`
        : `<div class="trow">
            <div class="barA" style="width:${d.winner === 'a' ? Math.max(8, (d.margin / maxMargin) * 100) : 0}%"></div>
            <div class="lab">#${d.puzzle}</div>
            <div class="barB" style="width:${d.winner === 'b' ? Math.max(8, (d.margin / maxMargin) * 100) : 0}%"></div>
          </div>`).join('')}
      </div>
      <p class="center muted small">Bar = winning margin · ${esc(teams.a.name)} ⟵ ⟶ ${esc(teams.b.name)}</p>
    </section>

    <section class="card">
      <h2>🥇 Player rankings</h2>
      <table>
        <thead><tr><th>Player</th><th>Avg</th><th>Played</th><th>MVPs</th><th>Fails</th></tr></thead>
        <tbody>${ranked.map((s, i) => `<tr>
          <td>${['🥇', '🥈', '🥉'][i] || ''} ${esc(s.pl.emoji)} ${esc(s.pl.name)}</td>
          <td><b>${s.avg.toFixed(2)}</b></td><td>${s.n}</td><td>${s.mvp}</td><td>${s.dist.X}</td></tr>`).join('')}
        </tbody>
      </table>
      <p class="muted small">Avg counts a fail (X) as ${fs}. MVP = best score of the day (ties share it).</p>
    </section>

    <section class="card">
      <h2>📊 Guess distribution</h2>
      <div class="players-dist">${pstats.map((s) => {
        const max = Math.max(1, ...Object.values(s.dist));
        const top = Object.entries(s.dist).reduce((m, e) => (e[1] > m[1] ? e : m), ['', 0])[0];
        return `<div><b>${esc(s.pl.emoji)} ${esc(s.pl.name)}</b><div class="dist">${Object.entries(s.dist).map(([k, v]) =>
          `<div class="drow"><span>${k}</span><div class="dbar ${k === top && v ? 'hi' : ''}" style="width:${Math.max(8, (v / max) * 100)}%">${v}</div></div>`).join('')}</div></div>`;
      }).join('')}</div>
    </section>`;
}

function renderHistory() {
  const puzzles = [...new Set([...state.scores.values()].map((s) => s.puzzle))].sort((a, b) => b - a);
  if (!puzzles.length) { app.innerHTML = `<section class="card center"><h2>📅 History</h2><p class="muted">Nothing yet — go post today's score!</p></section>`; return; }
  const { teams } = state.config;
  app.innerHTML = `<section class="card"><h2>📅 History</h2><ul class="hist">${puzzles.map((p) => {
    const r = dayResult(p);
    const res = !r.final ? `<span class="muted small">in progress</span>`
      : r.winner === 'tie' ? '🤝 Tie' : `👑 ${esc(teamOf(r.winner).emoji)} ${esc(teamOf(r.winner).name)}`;
    return `<li data-p="${p}">
      <div><b>#${p.toLocaleString()}</b> <span class="muted small">${fmtDate(dateForPuzzle(p))}</span><div class="small">${res}</div></div>
      <div class="score"><span class="${r.winner === 'a' ? 'wa' : ''}">${esc(teams.a.emoji)} ${r.teams.a.total}</span> – <span class="${r.winner === 'b' ? 'wb' : ''}">${r.teams.b.total} ${esc(teams.b.emoji)}</span></div>
    </li>`;
  }).join('')}</ul></section>`;
  app.querySelectorAll('[data-p]').forEach((li) => li.onclick = () => { state.viewPuzzle = Number(li.dataset.p); state.tab = 'today'; render(); });
}

function configForm(cfg, { setup = false } = {}) {
  const teamOpts = (sel) => ['a', 'b'].map((t) => `<option value="${t}" ${sel === t ? 'selected' : ''}>${esc(cfg.teams[t].name)}</option>`).join('');
  return `
    <h2>Teams</h2>
    ${['a', 'b'].map((t) => `<div class="teams-edit">
      <input type="text" name="temoji_${t}" value="${esc(cfg.teams[t].emoji)}" maxlength="4" aria-label="Team emoji">
      <input type="text" name="tname_${t}" value="${esc(cfg.teams[t].name)}" maxlength="20" aria-label="Team name"></div>`).join('')}
    <h2 style="margin-top:14px">Players</h2>
    <div id="plist">${cfg.players.map((p) => `<div class="prow-edit" data-id="${esc(p.id)}">
      <input type="text" name="pemoji" value="${esc(p.emoji)}" maxlength="4" aria-label="Emoji">
      <input type="text" name="pname" value="${esc(p.name)}" maxlength="20" aria-label="Name">
      <select name="pteam" aria-label="Team">${teamOpts(p.team)}</select>
      <button type="button" class="x" data-rm aria-label="Remove">✕</button></div>`).join('')}
    </div>
    <button type="button" class="btn" id="addP" style="width:100%">+ Add player</button>
    <div class="field" style="margin-top:14px">
      <label for="failScore">A fail (X/6) or a missed day counts as</label>
      <input type="number" id="failScore" min="6" max="12" value="${Number(cfg.failScore) || 7}">
    </div>
    <div class="row"><button type="button" class="btn primary" id="saveCfg">${setup ? "Let's play! 🎉" : 'Save changes'}</button></div>`;
}

function readConfigForm(root) {
  const teams = {};
  for (const t of ['a', 'b']) teams[t] = { name: $(`[name=tname_${t}]`, root).value.trim() || (t === 'a' ? 'Team A' : 'Team B'), emoji: $(`[name=temoji_${t}]`, root).value.trim() };
  const players = [...root.querySelectorAll('.prow-edit')].map((row) => ({
    id: row.dataset.id,
    name: $('[name=pname]', row).value.trim(),
    emoji: $('[name=pemoji]', row).value.trim() || '🙂',
    team: $('[name=pteam]', row).value,
  })).filter((p) => p.name);
  return { teams, players, failScore: Number($('#failScore', root).value) || 7 };
}

function wireConfigForm(root, onSave) {
  root.addEventListener('click', (e) => {
    if (e.target.matches('[data-rm]')) e.target.closest('.prow-edit').remove();
  });
  $('#addP', root).onclick = () => {
    const div = document.createElement('div');
    div.className = 'prow-edit';
    div.dataset.id = `p${Date.now().toString(36)}`;
    div.innerHTML = `<input type="text" name="pemoji" value="🙂" maxlength="4"><input type="text" name="pname" placeholder="Name" maxlength="20">
      <select name="pteam"><option value="a">${esc($('[name=tname_a]', root).value)}</option><option value="b">${esc($('[name=tname_b]', root).value)}</option></select>
      <button type="button" class="x" data-rm>✕</button>`;
    $('#plist', root).appendChild(div);
    $('[name=pname]', div).focus();
  };
  $('#saveCfg', root).onclick = async () => {
    const cfg = readConfigForm(root);
    if (cfg.players.length < 2) return toast('Add at least two players.');
    if (!cfg.players.some((p) => p.team === 'a') || !cfg.players.some((p) => p.team === 'b')) return toast('Each team needs at least one player.');
    try { await state.backend.saveConfig(cfg); onSave?.(cfg); } catch (e) { fail(e); }
  };
}

function renderSetup() {
  $('#tabs').hidden = true;
  app.innerHTML = `<section class="card">
    <h2>👋 Set up your family showdown</h2>
    <p class="muted small">Name the teams and players. You can change this any time in Settings.</p>
    <div id="cfgForm">${configForm(DEFAULT_CONFIG, { setup: true })}</div>
  </section>`;
  wireConfigForm($('#cfgForm'), () => toast('All set! Now pick who you are.'));
}

function renderWhoAmI() {
  $('#tabs').hidden = true;
  $('#whoBtn').textContent = '';
  app.innerHTML = `<section class="card">
    <h2 class="center">Who's on this phone?</h2>
    <p class="muted small center">We'll remember it so your score posts as you.</p>
    <div class="pick">${state.config.players.map((p) => `<button class="${p.team}" data-me="${esc(p.id)}"><span class="e">${esc(p.emoji)}</span>${esc(p.name)}</button>`).join('')}</div>
  </section>`;
  app.querySelectorAll('[data-me]').forEach((b) => b.onclick = () => {
    state.me = b.dataset.me; state.postAs = null; store.set('ws.me', state.me); render();
  });
}

function renderSettings() {
  const family = store.get('ws.family');
  app.innerHTML = `
    <section class="card"><div id="cfgForm">${configForm(state.config)}</div></section>
    <section class="card">
      <h2>This phone</h2>
      <p class="muted small">Signed in as ${esc(player(state.me).emoji)} ${esc(player(state.me).name)}.</p>
      <div class="row"><button class="btn" id="switchMe" type="button">Switch player</button></div>
      ${state.backend.kind === 'cloud' ? `
        <p class="muted small" style="margin-top:14px">Family code: <b>${esc(family)}</b> — share it so everyone joins the same scoreboard.</p>
        <div class="row"><button class="btn danger" id="leave" type="button">Use a different family code</button></div>` : `
        <p class="muted small" style="margin-top:14px">Local mode: scores are saved on this phone only. See the README to share a scoreboard with the family.</p>`}
    </section>
    <section class="card">
      <h2>Rules</h2>
      <p class="muted small">Each team's score is the sum of its players' guesses. Lowest total wins the day 👑. A fail (X/6) counts as ${Number(state.config.failScore) || 7}. Once the day is over, anyone who didn't post counts as a fail too. Today's grids stay blurred until you've posted your own — no peeking!</p>
    </section>`;
  wireConfigForm($('#cfgForm'), () => toast('Saved ✅'));
  $('#switchMe').onclick = () => { state.me = null; store.set('ws.me', null); render(); };
  const leave = $('#leave');
  if (leave) leave.onclick = () => { if (confirm('Switch to a different family code?')) { store.set('ws.family', null); store.set('ws.me', null); location.reload(); } };
}

// ---------- feedback ----------
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

function confetti() {
  const box = $('#confetti');
  const colors = ['#538d4e', '#b59f3b', '#ffcc33', '#4f8cff', '#ff5fa2', '#ffffff'];
  for (let i = 0; i < 120; i++) {
    const c = document.createElement('div');
    c.className = 'conf';
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = pick(colors);
    c.style.animationDuration = `${2 + Math.random() * 2}s`;
    c.style.animationDelay = `${Math.random() * 0.6}s`;
    box.appendChild(c);
    setTimeout(() => c.remove(), 5000);
  }
}

// Crown the winner once per day, per phone, the first time a day becomes final.
function maybeCelebrate() {
  if (!state.config || !state.me) return;
  for (const p of [today(), today() - 1]) {
    const r = dayResult(p);
    if (!r.final || !r.complete) continue;
    const seen = store.get('ws.celebrated', []);
    if (seen.includes(p)) continue;
    store.set('ws.celebrated', [...seen.slice(-30), p]);
    const tie = r.winner === 'tie';
    const t = tie ? null : teamOf(r.winner);
    const mine = !tie && player(state.me)?.team === r.winner;
    const ov = document.createElement('div');
    ov.className = 'celebrate';
    ov.innerHTML = `<div class="inner">
      <div class="bigcrown">${tie ? '🤝' : '👑'}</div>
      <h3>${tie ? "It's a tie!" : `${esc(t.emoji)} ${esc(t.name)} win!`}</h3>
      <p>Wordle #${p.toLocaleString()} · ${r.teams.a.total} – ${r.teams.b.total}<br>${esc(tie ? trashTalk(r) : mine ? 'Victory is yours. Gloat responsibly. 😏' : 'Ouch. There’s always tomorrow. 😤')}</p>
      <button class="btn primary" type="button">${mine ? 'Bask in glory' : 'Okay, okay'}</button></div>`;
    ov.onclick = () => ov.remove();
    document.body.appendChild(ov);
    confetti();
    break;
  }
}

// ---------- boot ----------
function askFamilyCode() {
  $('#tabs').hidden = true;
  app.innerHTML = `<section class="card">
    <h2>🔑 Join your family scoreboard</h2>
    <p class="muted small">Everyone in the family types the same code. Make it hard to guess (at least 8 characters), like <i>smith-wordle-2026</i>.</p>
    <div class="field"><input type="text" id="famCode" autocapitalize="none" autocomplete="off" placeholder="family code"></div>
    <div class="row"><button class="btn primary" id="joinBtn" type="button">Join</button></div>
  </section>`;
  return new Promise((resolve) => {
    $('#joinBtn').onclick = () => {
      const code = $('#famCode').value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
      if (code.length < 8) return toast('Use at least 8 letters/numbers.');
      store.set('ws.family', code);
      resolve(code);
    };
  });
}

async function boot() {
  document.querySelectorAll('#tabs button').forEach((b) => b.onclick = () => {
    state.tab = b.dataset.tab;
    if (state.tab === 'today') state.viewPuzzle = Math.min(state.viewPuzzle, today());
    render(); window.scrollTo(0, 0);
  });
  $('#whoBtn').onclick = () => { state.tab = 'settings'; render(); };

  if (SETTINGS.FIREBASE) {
    const family = store.get('ws.family') || await askFamilyCode();
    app.innerHTML = '<p class="loading">Loading…</p>';
    try {
      state.backend = await makeFirebaseBackend(SETTINGS.FIREBASE, family);
    } catch (e) {
      app.innerHTML = `<section class="card"><h2>😵 Couldn't connect</h2><p class="muted small">${esc(e.message)}</p></section>`;
      return;
    }
  } else {
    state.backend = makeLocalBackend();
    const b = $('#modeBanner');
    b.hidden = false;
    b.textContent = 'Local mode: scores are only saved on this device. Add Firebase settings in config.js to share with the family (see README).';
  }

  let gotConfig = false, gotScores = false;
  state.backend.onConfig((cfg) => { gotConfig = true; state.config = cfg; if (gotScores) { render(); maybeCelebrate(); } });
  state.backend.onScores((list) => {
    gotScores = true;
    state.scores = new Map(list.map((s) => [key(s.puzzle, s.playerId), s]));
    if (!gotConfig) return;
    // Don't wipe a half-typed paste while someone else's score arrives.
    const ta = $('#paste');
    const focused = ta && document.activeElement === ta;
    render();
    if (focused) { const n = $('#paste'); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); }
    maybeCelebrate();
  });

  // Roll over to the new puzzle at midnight if the app is left open.
  let lastToday = today();
  setInterval(() => {
    if (today() !== lastToday) { if (state.viewPuzzle === lastToday) state.viewPuzzle = today(); lastToday = today(); render(); }
  }, 60_000);
}

boot();
