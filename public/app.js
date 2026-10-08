/* KnowLoop front-end: tiny hash-router SPA, no build step. */
const $ = (s) => document.querySelector(s);
const app = $('#app');
let token = localStorage.getItem('kl_token'), me = null, timers = [];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (iso) => new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const initials = (n) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && token) { logout(); }
  if (!r.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), 2800); }
function modal(html) { const m = $('#modal'); m.innerHTML = `<div class="box">${html}</div>`; m.classList.remove('hidden'); m.onclick = (e) => { if (e.target === m) closeModal(); }; }
function closeModal() { $('#modal').classList.add('hidden'); }
function logout() { token = null; me = null; localStorage.removeItem('kl_token'); location.hash = '#/'; renderNav(); }
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };

// ---------- shared UI bits ----------
const roleTag = (u) => `<span class="tag ${u.role === 'professional' ? 'pro' : 'stu'}">${u.role === 'professional' ? 'PRO' : 'STUDENT'}</span>`;
const verBadge = (u) => u.verified ? '<span class="ver" title="Verified">✔</span>' : '';
const stars = (u) => u.rating ? `⭐ ${u.rating} <span class="mut small">(${u.reviews})</span>` : '<span class="mut small">New</span>';
function userCard(u, extra = '') {
  return `<div class="card"><div class="row"><div class="avatar">${esc(initials(u.name))}</div>
    <div><a href="#/user/${u.id}"><b>${esc(u.name)}</b></a> ${verBadge(u)} ${roleTag(u)}<div class="mut small">${esc(u.headline || u.org)}</div></div></div>
    <p class="small mut">${esc(u.org)}${u.org && u.headline ? '' : ''}</p>
    <div>${u.teach.slice(0, 5).map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>
    <div class="row between" style="margin-top:.6rem"><span>${stars(u)}</span><span class="small mut">Lv ${u.level} · ${u.sessionsTaught} taught</span></div>
    ${extra}<a class="btn sm" style="display:inline-block;margin-top:.6rem" href="#/user/${u.id}">View & book</a></div>`;
}

function renderNav() {
  const l = (h, t) => `<a class="link ${location.hash.startsWith(h) ? 'on' : ''}" href="${h}">${t}</a>`;
  $('#nav').innerHTML = `<a class="logo" href="#/">Know<span>Loop</span></a>` + (me
    ? `${l('#/discover', 'Discover')}${l('#/requests', 'Request Board')}${l('#/dashboard', 'My Sessions')}${l('#/availability', 'Availability')}${l('#/leaderboard', 'Leaderboard')}${me.isAdmin ? l('#/admin', 'Admin') : ''}
       <span class="sp"></span><a class="link" href="#/profile">${esc(me.name.split(' ')[0])} · Lv ${me.level}</a><a class="link" href="#" onclick="logout();return false">Log out</a>`
    : `<span class="sp"></span><a class="link" href="#/login">Log in</a><a class="btn sm" href="#/register">Join free</a>`);
}

// ---------- router ----------
const routes = [
  [/^#\/?$/, landing], [/^#\/login$/, authPage('login')], [/^#\/register$/, authPage('register')],
  [/^#\/discover$/, discover], [/^#\/user\/(\d+)$/, userPage], [/^#\/dashboard$/, dashboard], [/^#\/availability$/, availability],
  [/^#\/profile$/, profile], [/^#\/requests$/, requests], [/^#\/leaderboard$/, leaderboard], [/^#\/session\/(\d+)$/, session], [/^#\/admin$/, admin],
];
const publicRoutes = ['#/', '#', '#/login', '#/register'];
async function route() {
  timers.forEach(clearInterval); timers = []; app.onclick = null;
  const h = location.hash || '#/';
  if (token && !me) { try { me = await api('/me'); } catch { token = null; } }
  renderNav();
  if (!token && !publicRoutes.includes(h)) { location.hash = '#/login'; return; }
  for (const [re, fn] of routes) { const m = h.match(re); if (m) { try { await fn(...m.slice(1)); } catch (e) { app.innerHTML = `<div class="card">${esc(e.message)}</div>`; } window.scrollTo(0, 0); return; } }
  app.innerHTML = '<div class="card">Page not found. <a href="#/">Go home</a></div>';
}
window.addEventListener('hashchange', route); window.addEventListener('load', route);

// ---------- pages ----------
async function landing() {
  const s = await api('/stats').catch(() => ({ users: 0, mentors: 0, sessions: 0 }));
  app.innerHTML = `
  <section class="hero"><h1>Learn 1:1. Teach 1:1.<br><span class="grad">Loop it.</span></h1>
    <p>KnowLoop is a free platform where college students book one-on-one sessions with industry professionals, learn from seniors and peers, and teach back what they know. Every skill you have is worth something.</p>
    <div class="row" style="justify-content:center"><a class="btn" href="${me ? '#/discover' : '#/register'}">${me ? 'Find a mentor' : 'Get started - it\'s free'}</a><a class="btn alt" href="#/requests">Browse requests</a></div>
    <div class="stats"><div class="stat"><b>${s.users}</b><span class="mut">learners & mentors</span></div><div class="stat"><b>${s.mentors}</b><span class="mut">verified pros</span></div><div class="stat"><b>${s.sessions}</b><span class="mut">sessions done</span></div></div></section>
  <h2>How it works</h2>
  <div class="grid how"><div class="card"><h3>Create your skill profile</h3><p class="mut">List what you can teach and what you want to learn. College email = instant verified student badge.</p></div>
  <div class="card"><h3>Get matched or search</h3><p class="mut">Smart matching suggests mentors for your goals and finds swap partners who want what you know.</p></div>
  <div class="card"><h3>Book a 1:1 slot</h3><p class="mut">Pick a time from their live availability. No back-and-forth messages.</p></div>
  <div class="card"><h3>Meet, chat, take notes</h3><p class="mut">Built-in video room, chat and shared notes. Then rate each other and earn XP.</p></div></div>
  <h2 style="margin-top:2rem">Why KnowLoop is different</h2>
  <div class="grid">
   <div class="card"><h3>🔁 Skill Swap mode</h3><p class="mut">Teach me X, I'll teach you Y in the same session. Learning without money or ego.</p></div>
   <div class="card"><h3>🎓 Both directions</h3><p class="mut">Professionals mentor students; students mentor students. Most platforms do only one.</p></div>
   <div class="card"><h3>📣 Request Board</h3><p class="mut">Post what you need. Mentors and seniors offer to help. Demand-driven, not just a directory.</p></div>
   <div class="card"><h3>🏆 XP, levels & badges</h3><p class="mut">Teaching earns the most XP, so everyone is rewarded for sharing knowledge.</p></div>
   <div class="card"><h3>🛡️ Trust & safety</h3><p class="mut">Verified badges, ratings, in-app sessions only, one-tap reporting.</p></div>
   <div class="card"><h3>💸 Free for students</h3><p class="mut">Built for Indian campuses where paid mentorship is out of reach.</p></div></div>`;
}

function authPage(mode) {
  return async () => {
    const reg = mode === 'register';
    app.innerHTML = `<div class="card" style="max-width:480px;margin:1rem auto"><h2>${reg ? 'Join KnowLoop' : 'Welcome back'}</h2><div id="f">
      ${reg ? `<label>I am a</label><select id="role"><option value="student">College student</option><option value="professional">Working professional</option></select>
      <label>Full name</label><input id="name" maxlength="60">` : ''}
      <label>Email ${reg ? '<span class="mut">(use your college email for a verified badge)</span>' : ''}</label><input id="email" type="email">
      <label>Password ${reg ? '(min 8 chars)' : ''}</label><input id="pw" type="password">
      ${reg ? `<label>College / Company</label><input id="org" maxlength="80"><label>Headline (e.g. "BCA 2nd year | Web dev")</label><input id="headline" maxlength="100">
      <label>Skills I can teach (comma separated)</label><input id="teach" placeholder="React, Excel, Public Speaking"><label>Skills I want to learn</label><input id="learn" placeholder="Machine Learning, System Design">` : ''}
      <p><button class="btn" id="go" style="width:100%">${reg ? 'Create account' : 'Log in'}</button></p>
      <p class="small mut">${reg ? 'Have an account? <a href="#/login">Log in</a>' : 'New here? <a href="#/register">Create account</a> · Demo: ananya@demo.ac.in / demo1234'}</p></div></div>`;
    const v = (id) => ($('#' + id) || {}).value;
    $('#go').onclick = guard(async () => {
      const body = reg ? { role: v('role'), name: v('name'), email: v('email'), password: v('pw'), org: v('org'), headline: v('headline'), teach: v('teach'), learn: v('learn') } : { email: v('email'), password: v('pw') };
      const r = await api('/auth/' + mode, 'POST', body);
      token = r.token; localStorage.setItem('kl_token', token); me = null; location.hash = '#/discover';
    });
  };
}

async function discover() {
  const [skills, recs] = await Promise.all([api('/skills'), api('/recommendations')]);
  app.innerHTML = `<h2>Discover</h2>
  ${recs.length ? `<div class="banner">✨ <b>Matched for you</b> - based on what you want to learn and can teach</div><div class="grid" id="recs">${recs.map((u) => userCard(u, `<div class="small" style="margin-top:.4rem">${u.canTeachMe.length ? `<span class="chip learn">Can teach you: ${esc(u.canTeachMe.join(', '))}</span>` : ''}${u.swapMatch ? '<span class="chip badge">🔁 Swap match</span>' : u.wantsFromMe.length ? `<span class="chip badge">Wants to learn: ${esc(u.wantsFromMe.join(', '))}</span>` : ''}</div>`)).join('')}</div>` : `<div class="banner">Add skills to your <a href="#/profile">profile</a> to get smart matches.</div>`}
  <h3 style="margin-top:1.5rem">Browse everyone</h3>
  <div class="row"><input id="q" placeholder="Search skill, name, company..." style="flex:2;min-width:200px"><select id="role" style="flex:1"><option value="">All</option><option value="professional">Professionals</option><option value="student">Students</option></select>
  <select id="sort" style="flex:1"><option value="rating">Top rated</option><option value="sessions">Most sessions</option><option value="soon">Available soonest</option></select></div>
  <div class="tabs" id="chips">${skills.slice(0, 14).map((s) => `<button class="btn alt sm" data-s="${esc(s.skill)}">${esc(s.skill)}</button>`).join('')}</div>
  <div class="grid" id="list"></div>`;
  let skill = '';
  const load = guard(async () => {
    const p = new URLSearchParams({ q: $('#q').value, role: $('#role').value, sort: $('#sort').value, skill });
    const list = await api('/mentors?' + p);
    $('#list').innerHTML = list.length ? list.map((u) => userCard(u, `<div class="small mut" style="margin-top:.3rem">${u.nextSlot ? 'Next slot: ' + fmt(u.nextSlot) : 'No open slots'}</div>`)).join('') : '<p class="mut">No one matches yet. Try the <a href="#/requests">Request Board</a>.</p>';
  });
  $('#q').oninput = debounce(load, 250); $('#role').onchange = load; $('#sort').onchange = load;
  $('#chips').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; skill = skill === b.dataset.s ? '' : b.dataset.s; [...$('#chips').children].forEach((c) => c.style.outline = c.dataset.s === skill ? '2px solid var(--b)' : ''); load(); };
  load();
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

async function userPage(id) {
  const u = await api('/users/' + id);
  app.innerHTML = `<div class="card"><div class="row"><div class="avatar lg">${esc(initials(u.name))}</div><div style="flex:1"><h2 style="margin:0">${esc(u.name)} ${verBadge(u)} ${roleTag(u)}</h2>
    <div class="mut">${esc(u.headline)}${u.org ? ' · ' + esc(u.org) : ''}</div><div>${stars(u)} · Level ${u.level} · ${u.xp} XP</div>
    ${u.linkedin ? `<a class="small" href="${esc(u.linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>` : ''}</div>
    ${u.id !== me.id ? '<button class="btn alt sm" id="rep">Report</button>' : ''}</div>
    <p>${esc(u.bio) || '<span class="mut">No bio yet.</span>'}</p>
    <h3>Can teach</h3><div>${u.teach.map((s) => `<span class="chip">${esc(s)}</span>`).join('') || '-'}</div>
    <h3>Wants to learn</h3><div>${u.learn.map((s) => `<span class="chip learn">${esc(s)}</span>`).join('') || '-'}</div>
    <h3>Badges</h3><div>${u.badges.map((b) => `<span class="chip badge">${esc(b)}</span>`).join('') || '<span class="mut small">None yet</span>'}</div></div>
  ${u.id !== me.id ? `<div class="card" style="margin-top:1rem"><h3>Book a 1:1 session</h3>${u.slots.length ? `<div id="slots">${u.slots.map((s) => `<button class="slot" data-id="${s.id}">${fmt(s.start_ts)} · ${s.duration}m</button>`).join('')}</div>
    <label>What do you want to learn?</label><input id="topic" maxlength="120" placeholder="e.g. Review my resume / Explain Docker basics">
    <label>Message (optional)</label><textarea id="msg" rows="2" maxlength="500"></textarea>
    <label><input type="checkbox" id="swap" style="width:auto"> 🔁 Skill Swap - I'll teach something back</label>
    <div id="swapbox" class="hidden"><input id="swapskill" maxlength="60" placeholder="Skill I'll teach (from: ${esc(me.teach.join(', ') || 'your profile')})"></div>
    <p><button class="btn" id="book">Request session</button></p>` : '<p class="mut">No open slots right now. Post on the <a href="#/requests">Request Board</a>.</p>'}</div>` : ''}
  <div class="card" style="margin-top:1rem"><h3>Reviews</h3>${u.reviewList.map((r) => `<p>${'⭐'.repeat(r.rating)} <b>${esc(r.reviewer)}</b><br><span class="mut">${esc(r.comment)}</span></p>`).join('') || '<p class="mut">No reviews yet.</p>'}</div>`;
  let sel = null;
  const sl = $('#slots'); if (sl) sl.onclick = (e) => { const b = e.target.closest('.slot'); if (!b) return; sel = +b.dataset.id; sl.querySelectorAll('.slot').forEach((x) => x.classList.toggle('sel', x === b)); };
  if ($('#swap')) $('#swap').onchange = (e) => $('#swapbox').classList.toggle('hidden', !e.target.checked);
  if ($('#book')) $('#book').onclick = guard(async () => {
    if (!sel) throw new Error('Pick a time slot');
    await api('/bookings', 'POST', { slotId: sel, topic: $('#topic').value, message: $('#msg').value, mode: $('#swap').checked ? 'swap' : 'learn', swapSkill: $('#swapskill').value });
    toast('Request sent! 🎉'); location.hash = '#/dashboard';
  });
  if ($('#rep')) $('#rep').onclick = () => { modal(`<h3>Report ${esc(u.name)}</h3><textarea id="why" rows="3" placeholder="What happened?"></textarea><p><button class="btn bad" id="sendrep">Submit report</button> <button class="btn alt" onclick="closeModal()">Cancel</button></p>`); $('#sendrep').onclick = guard(async () => { await api('/report', 'POST', { targetId: u.id, reason: $('#why').value }); closeModal(); toast('Thanks, our team will review it.'); }); };
}

async function dashboard() {
  const [list, mine] = await Promise.all([api('/bookings'), api('/me')]); me = mine;
  const into = me.xp % 100;
  const card = (b) => {
    const other = b.iAmMentor ? b.learner : b.mentor;
    return `<div class="card"><div class="row between"><div><b>${esc(b.topic)}</b> ${b.mode === 'swap' ? '<span class="chip badge">🔁 Swap: ' + esc(b.swapSkill) + '</span>' : ''}<div class="mut small">${b.iAmMentor ? 'You teach' : 'You learn from'} <a href="#/user/${other.id}">${esc(other.name)}</a> · ${fmt(b.start)} · ${b.duration}m</div></div><span class="status s-${b.status}">${b.status}</span></div>
    ${b.message ? `<p class="small mut">“${esc(b.message)}”</p>` : ''}<div class="row" style="margin-top:.5rem">
    ${b.status === 'pending' && b.iAmMentor ? `<button class="btn ok sm" data-a="accepted" data-id="${b.id}">Accept</button><button class="btn bad sm" data-a="declined" data-id="${b.id}">Decline</button>` : ''}
    ${['pending', 'accepted'].includes(b.status) ? `<button class="btn alt sm" data-a="cancelled" data-id="${b.id}">Cancel</button>` : ''}
    ${['accepted', 'completed'].includes(b.status) ? `<a class="btn sm" href="#/session/${b.id}">${b.status === 'accepted' ? 'Join session' : 'Notes & chat'}</a>` : ''}
    ${b.status === 'completed' && !b.reviewed ? `<button class="btn alt sm" data-review="${b.id}">Leave review</button>` : ''}</div></div>`;
  };
  const up = list.filter((b) => ['pending', 'accepted'].includes(b.status)), past = list.filter((b) => !['pending', 'accepted'].includes(b.status));
  app.innerHTML = `<div class="card"><div class="row between"><h2 style="margin:0">Hi ${esc(me.name.split(' ')[0])} 👋</h2><span>Level <b>${me.level}</b> · ${me.xp} XP</span></div>
    <div class="xpbar" style="margin:.6rem 0"><i style="width:${into}%"></i></div><div class="small mut">${100 - into} XP to level ${me.level + 1}. Teaching = +50 XP, learning = +20, swaps = +25 bonus.</div>
    <div style="margin-top:.5rem">${me.badges.map((b) => `<span class="chip badge">${esc(b)}</span>`).join('')}</div></div>
    <h3 style="margin-top:1.5rem">Upcoming & pending</h3><div class="grid" style="grid-template-columns:1fr">${up.map(card).join('') || '<p class="mut">Nothing yet. <a href="#/discover">Find a mentor</a> or <a href="#/availability">add your slots</a> so others can book you.</p>'}</div>
    <h3 style="margin-top:1.5rem">History</h3><div class="grid" style="grid-template-columns:1fr">${past.map(card).join('') || '<p class="mut">No past sessions.</p>'}</div>`;
  app.onclick = guard(async (e) => {
    const a = e.target.closest('[data-a]'), r = e.target.closest('[data-review]');
    if (a) { await api('/bookings/' + a.dataset.id, 'PATCH', { status: a.dataset.a }); toast('Updated'); dashboard(); }
    if (r) reviewModal(+r.dataset.review, dashboard);
  });
}
function reviewModal(id, done) {
  let rating = 5;
  modal(`<h3>How was the session?</h3><div class="stars" id="st">${[1, 2, 3, 4, 5].map((n) => `<button data-n="${n}" class="on">★</button>`).join('')}</div><textarea id="rc" rows="3" maxlength="400" placeholder="What went well?"></textarea><p><button class="btn" id="sr">Submit (+10 XP)</button></p>`);
  $('#st').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; rating = +b.dataset.n; [...$('#st').children].forEach((x) => x.classList.toggle('on', +x.dataset.n <= rating)); };
  $('#sr').onclick = guard(async () => { await api(`/bookings/${id}/review`, 'POST', { rating, comment: $('#rc').value }); closeModal(); toast('Thanks for the feedback!'); done && done(); });
}

async function session(id) {
  const b = await api(`/bookings/${id}/room`);
  const other = b.iAmMentor ? b.learner : b.mentor, live = b.status === 'accepted';
  app.innerHTML = `<div class="row between"><div><h2 style="margin:0">${esc(b.topic)}</h2><div class="mut small">with ${esc(other.name)} · ${fmt(b.start)} · ${b.duration} min</div></div>
    ${live ? '<button class="btn ok" id="end">End & mark complete</button>' : '<span class="status s-completed">completed</span>'}</div>
    ${b.mode === 'swap' ? `<div class="banner">🔁 <b>Skill Swap:</b> first half - ${esc(b.mentor.name)} teaches <i>${esc(b.topic)}</i>; second half - ${esc(b.learner.name)} teaches <i>${esc(b.swapSkill)}</i>.</div>` : ''}
    <div class="room"><div>${live ? `<iframe allow="camera; microphone; fullscreen; display-capture; autoplay" src="https://meet.jit.si/${esc(b.room)}#userInfo.displayName=%22${encodeURIComponent(me.name)}%22&config.prejoinPageEnabled=false"></iframe><p class="small mut">Video runs on Jitsi Meet (free, no install). Allow camera & mic when asked.</p>` : '<div class="card mut">This session has ended. Chat and notes remain available.</div>'}</div>
    <div><div class="card"><h3>Chat</h3><div class="chat" id="chat"></div><div class="row" style="flex-wrap:nowrap"><input id="cm" maxlength="1000" placeholder="Message..."><button class="btn sm" id="send">Send</button></div></div>
    <div class="card" style="margin-top:1rem"><h3>Shared notes</h3><textarea id="notes" rows="6" maxlength="5000" placeholder="Key takeaways, links, homework...">${esc(b.notes)}</textarea><div class="small mut" id="ns">Auto-saves</div></div></div></div>`;
  let last = 0; const chat = $('#chat');
  const poll = async () => { try { const ms = await api(`/bookings/${id}/messages?after=${last}`); ms.forEach((m) => { last = m.id; chat.insertAdjacentHTML('beforeend', `<div class="msg ${m.sender_id === me.id ? 'me' : ''}">${esc(m.body)}</div>`); }); if (ms.length) chat.scrollTop = chat.scrollHeight; } catch {} };
  poll(); timers.push(setInterval(poll, 3000));
  const send = guard(async () => { const v = $('#cm').value.trim(); if (!v) return; $('#cm').value = ''; await api(`/bookings/${id}/messages`, 'POST', { body: v }); poll(); });
  $('#send').onclick = send; $('#cm').onkeydown = (e) => { if (e.key === 'Enter') send(); };
  const save = debounce(async () => { try { await api(`/bookings/${id}/notes`, 'PUT', { notes: $('#notes').value }); $('#ns').textContent = 'Saved ✓'; } catch { $('#ns').textContent = 'Save failed'; } }, 800);
  $('#notes').oninput = () => { $('#ns').textContent = 'Saving...'; save(); };
  if ($('#end')) $('#end').onclick = guard(async () => { await api('/bookings/' + id, 'PATCH', { status: 'completed' }); me = null; toast('Session complete! XP earned 🎉'); reviewModal(id, () => (location.hash = '#/dashboard')); });
}

async function availability() {
  const slots = await api('/my/slots');
  app.innerHTML = `<h2>My availability</h2><p class="mut">Add the times you're free to teach. Learners can book these slots directly.</p>
  <div class="card"><div class="row"><div style="flex:2;min-width:200px"><label>Start</label><input type="datetime-local" id="st"></div><div style="flex:1"><label>Length</label><select id="du"><option>15</option><option selected>30</option><option>45</option><option>60</option></select></div><div style="align-self:end"><button class="btn" id="add">Add slot</button></div></div>
  <div class="row" style="margin-top:.6rem"><button class="btn alt sm" id="quick">+ Add next 5 days @ 6 PM</button></div></div>
  <h3 style="margin-top:1.5rem">Your upcoming slots</h3><div>${slots.map((s) => `<span class="slot" style="cursor:default">${fmt(s.start_ts)} · ${s.duration}m ${s.booked ? '<span class="status s-accepted">booked</span>' : `<button class="btn bad sm" data-del="${s.id}">✕</button>`}</span>`).join('') || '<p class="mut">No slots yet.</p>'}</div>`;
  $('#add').onclick = guard(async () => { if (!$('#st').value) throw new Error('Pick a date & time'); await api('/slots', 'POST', { start: new Date($('#st').value).toISOString(), duration: $('#du').value }); availability(); });
  $('#quick').onclick = guard(async () => { for (let d = 1; d <= 5; d++) { const t = new Date(); t.setDate(t.getDate() + d); t.setHours(18, 0, 0, 0); await api('/slots', 'POST', { start: t.toISOString(), duration: 30 }).catch(() => {}); } availability(); });
  app.onclick = guard(async (e) => { const d = e.target.closest('[data-del]'); if (d) { await api('/slots/' + d.dataset.del, 'DELETE'); availability(); } });
}

async function profile() {
  const u = await api('/me');
  app.innerHTML = `<div class="card" style="max-width:640px;margin:auto"><h2>Edit profile</h2>
  <label>Name</label><input id="name" value="${esc(u.name)}"><label>College / Company</label><input id="org" value="${esc(u.org)}"><label>Headline</label><input id="headline" value="${esc(u.headline)}">
  <label>About me</label><textarea id="bio" rows="4" maxlength="600">${esc(u.bio)}</textarea><label>LinkedIn URL</label><input id="li" value="${esc(u.linkedin)}">
  <label>Skills I can teach (comma separated)</label><input id="teach" value="${esc(u.teach.join(', '))}"><label>Skills I want to learn</label><input id="learn" value="${esc(u.learn.join(', '))}">
  <p>${u.verified ? '<span class="ver">✔ Verified</span>' : '<span class="mut small">Not verified yet. Students: sign up with a college email. Professionals: add your LinkedIn and an admin will verify you.</span>'}</p>
  <button class="btn" id="save">Save changes</button></div>`;
  $('#save').onclick = guard(async () => { me = { ...(await api('/me', 'PUT', { name: $('#name').value, org: $('#org').value, headline: $('#headline').value, bio: $('#bio').value, linkedin: $('#li').value, teach: $('#teach').value, learn: $('#learn').value })), isAdmin: me.isAdmin }; renderNav(); toast('Profile saved ✓'); });
}

async function requests() {
  const list = await api('/requests');
  app.innerHTML = `<h2>Request Board</h2><p class="mut">Can't find the right mentor? Post what you want to learn. People who can teach it will offer to help.</p>
  <div class="card"><div class="row"><input id="rs" placeholder="Skill (e.g. Docker, Figma)" style="flex:1;min-width:160px" maxlength="60"><input id="rd" placeholder="Details (optional)" style="flex:2;min-width:200px" maxlength="400"><button class="btn" id="rp">Post request</button></div></div>
  <div class="grid" style="margin-top:1rem">${list.map((r) => `<div class="card"><div class="row between"><b>${esc(r.skill)}</b><span class="small mut">${r.offers} offer${r.offers === 1 ? '' : 's'}</span></div><p class="small mut">${esc(r.details)}</p>
    <div class="row"><a href="#/user/${r.user.id}">${esc(r.user.name)}</a> ${roleTag(r.user)}</div>
    ${r.user.id === me.id ? `<button class="btn alt sm" data-close="${r.id}" style="margin-top:.5rem">Close</button>` : r.iOffered ? '<span class="chip">Offered ✓</span>' : `<button class="btn sm" data-offer="${r.id}" style="margin-top:.5rem">I can help</button>`}</div>`).join('') || '<p class="mut">No open requests.</p>'}</div>`;
  $('#rp').onclick = guard(async () => { await api('/requests', 'POST', { skill: $('#rs').value, details: $('#rd').value }); toast('Posted'); requests(); });
  app.onclick = guard(async (e) => {
    const o = e.target.closest('[data-offer]'), c = e.target.closest('[data-close]');
    if (o) { await api(`/requests/${o.dataset.offer}/offer`, 'POST', { message: '' }); toast('Offer sent - they can see your profile and book you'); requests(); }
    if (c) { await api('/requests/' + c.dataset.close, 'DELETE'); requests(); }
  });
}

async function leaderboard() {
  const list = await api('/leaderboard');
  app.innerHTML = `<h2>🏆 Leaderboard</h2><p class="mut">XP comes from teaching, learning, swaps and reviews.</p><div class="grid" style="grid-template-columns:1fr">${list.map((u, i) => `<div class="card row between"><div class="row"><b style="width:2rem">#${i + 1}</b><div class="avatar">${esc(initials(u.name))}</div><div><a href="#/user/${u.id}">${esc(u.name)}</a> ${verBadge(u)}<div class="small mut">${esc(u.org)}</div></div></div><div><b>${u.xp} XP</b> · Lv ${u.level}</div></div>`).join('')}</div>`;
}

async function admin() {
  const d = await api('/admin/overview');
  app.innerHTML = `<h2>Admin</h2><h3>Professionals awaiting verification</h3>${d.pending.map((p) => `<div class="card row between" style="margin-bottom:.5rem"><div>${esc(p.name)} · ${esc(p.org)} ${p.linkedin ? `<a href="${esc(p.linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn</a>` : ''}</div><button class="btn ok sm" data-v="${p.id}">Verify</button></div>`).join('') || '<p class="mut">None.</p>'}
  <h3>Reports</h3>${d.reports.map((r) => `<div class="card small" style="margin-bottom:.5rem">User #${r.target_id} reported by #${r.reporter_id}: ${esc(r.reason)}</div>`).join('') || '<p class="mut">None.</p>'}`;
  app.onclick = guard(async (e) => { const v = e.target.closest('[data-v]'); if (v) { await api('/admin/verify/' + v.dataset.v, 'POST'); admin(); } });
}
