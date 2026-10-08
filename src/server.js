const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
const EDU_RE = /\.(ac\.in|edu|edu\.in|ac\.uk)$/i;

const app = express();
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- helpers ----------
const parse = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };
const cleanSkills = (a) => [...new Set((Array.isArray(a) ? a : String(a || '').split(','))
  .map((s) => String(s).trim().slice(0, 40)).filter(Boolean))].slice(0, 12);
const norm = (s) => String(s).toLowerCase().trim();
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const level = (xp) => Math.floor(xp / 100) + 1;

function publicUser(u, extra = {}) {
  const r = db.prepare('SELECT ROUND(AVG(rating),2) avg, COUNT(*) n FROM reviews WHERE reviewee_id=?').get(u.id);
  const taught = db.prepare(`SELECT COUNT(*) c FROM bookings WHERE mentor_id=? AND status='completed'`).get(u.id).c;
  const learned = db.prepare(`SELECT COUNT(*) c FROM bookings WHERE learner_id=? AND status='completed'`).get(u.id).c;
  const swaps = db.prepare(`SELECT COUNT(*) c FROM bookings WHERE mode='swap' AND status='completed' AND (mentor_id=? OR learner_id=?)`).get(u.id, u.id).c;
  const badges = [];
  if (taught + learned >= 1) badges.push('First Session');
  if (taught >= 5) badges.push('Super Mentor');
  if (learned >= 5) badges.push('Curious Cat');
  if (swaps >= 2) badges.push('Skill Swapper');
  if (r.n >= 3 && r.avg >= 4.5) badges.push('Top Rated');
  if (u.verified) badges.push(u.role === 'professional' ? 'Verified Pro' : 'Verified Student');
  return { id: u.id, name: u.name, role: u.role, org: u.org, headline: u.headline, bio: u.bio, linkedin: u.linkedin,
    teach: parse(u.teach), learn: parse(u.learn), verified: !!u.verified, xp: u.xp, level: level(u.xp),
    rating: r.avg || null, reviews: r.n, sessionsTaught: taught, sessionsLearned: learned, badges, ...extra };
}
const getUser = (id) => db.prepare('SELECT * FROM users WHERE id=?').get(id);
const sign = (u) => jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' });

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  try {
    const { id } = jwt.verify(h.replace('Bearer ', ''), SECRET);
    const u = getUser(id);
    if (!u) throw new Error('no user');
    req.user = u; next();
  } catch { res.status(401).json({ error: 'Please log in' }); }
}
const wrap = (fn) => (req, res) => { try { fn(req, res); } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); } };

// ---------- auth ----------
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60 });
app.post('/api/auth/register', authLimiter, wrap((req, res) => {
  const name = str(req.body.name, 60), email = str(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || ''), role = req.body.role;
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Valid name and email required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (!['student', 'professional'].includes(role)) return res.status(400).json({ error: 'Choose student or professional' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'Email already registered' });
  const verified = role === 'student' && EDU_RE.test(email) ? 1 : 0; // college email => auto-verified student
  const id = db.prepare(`INSERT INTO users(name,email,pass_hash,role,org,headline,linkedin,teach,learn,verified) VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run(name, email, bcrypt.hashSync(password, 10), role, str(req.body.org, 80), str(req.body.headline, 100),
      str(req.body.linkedin, 200), JSON.stringify(cleanSkills(req.body.teach)), JSON.stringify(cleanSkills(req.body.learn)), verified).lastInsertRowid;
  const u = getUser(id);
  res.json({ token: sign(u), user: publicUser(u, { email }) });
}));
app.post('/api/auth/login', authLimiter, wrap((req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(str(req.body.email, 120).toLowerCase());
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.pass_hash)) return res.status(401).json({ error: 'Wrong email or password' });
  res.json({ token: sign(u), user: publicUser(u, { email: u.email }) });
}));
app.get('/api/me', auth, wrap((req, res) => res.json(publicUser(req.user, { email: req.user.email, isAdmin: !!ADMIN_EMAIL && req.user.email === ADMIN_EMAIL }))));
app.put('/api/me', auth, wrap((req, res) => {
  const b = req.body;
  db.prepare('UPDATE users SET name=?, org=?, headline=?, bio=?, linkedin=?, teach=?, learn=? WHERE id=?')
    .run(str(b.name, 60) || req.user.name, str(b.org, 80), str(b.headline, 100), str(b.bio, 600), str(b.linkedin, 200),
      JSON.stringify(cleanSkills(b.teach)), JSON.stringify(cleanSkills(b.learn)), req.user.id);
  res.json(publicUser(getUser(req.user.id), { email: req.user.email }));
}));

// ---------- discovery ----------
app.get('/api/mentors', auth, wrap((req, res) => {
  const q = norm(req.query.q || ''), role = req.query.role, skill = norm(req.query.skill || '');
  let list = db.prepare('SELECT * FROM users WHERE id != ?').all(req.user.id).map((u) => publicUser(u));
  if (role === 'student' || role === 'professional') list = list.filter((u) => u.role === role);
  if (skill) list = list.filter((u) => u.teach.some((s) => norm(s) === skill));
  if (q) list = list.filter((u) => [u.name, u.headline, u.org, ...u.teach].join(' ').toLowerCase().includes(q));
  const nextSlot = db.prepare(`SELECT MIN(start_ts) t FROM slots WHERE user_id=? AND booked=0 AND start_ts > ?`);
  list.forEach((u) => { u.nextSlot = nextSlot.get(u.id, new Date().toISOString()).t; });
  const sort = req.query.sort;
  list.sort((a, b) => sort === 'sessions' ? b.sessionsTaught - a.sessionsTaught
    : sort === 'soon' ? (a.nextSlot || '9') .localeCompare(b.nextSlot || '9')
    : (b.rating || 0) - (a.rating || 0) || b.xp - a.xp);
  res.json(list);
}));
app.get('/api/skills', wrap((req, res) => {
  const counts = {};
  db.prepare('SELECT teach FROM users').all().forEach((r) => parse(r.teach).forEach((s) => { counts[s] = (counts[s] || 0) + 1; }));
  res.json(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([skill, count]) => ({ skill, count })));
}));
// Smart matching: who teaches what I want to learn, and (bonus) who wants what I can teach => swap partner
app.get('/api/recommendations', auth, wrap((req, res) => {
  const myLearn = new Set(parse(req.user.learn).map(norm)), myTeach = new Set(parse(req.user.teach).map(norm));
  const out = db.prepare('SELECT * FROM users WHERE id != ?').all(req.user.id).map((u) => {
    const teach = parse(u.teach).map(norm), learn = parse(u.learn).map(norm);
    const canTeachMe = teach.filter((s) => myLearn.has(s)), wantsFromMe = learn.filter((s) => myTeach.has(s));
    const pu = publicUser(u);
    const score = canTeachMe.length * 3 + wantsFromMe.length * 2 + (canTeachMe.length && wantsFromMe.length ? 4 : 0) + (pu.rating || 0) * 0.2;
    return { ...pu, score, canTeachMe, wantsFromMe, swapMatch: canTeachMe.length > 0 && wantsFromMe.length > 0 };
  }).filter((u) => u.canTeachMe.length || u.wantsFromMe.length).sort((a, b) => b.score - a.score).slice(0, 6);
  res.json(out);
}));
app.get('/api/users/:id', auth, wrap((req, res) => {
  const u = getUser(+req.params.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  const slots = db.prepare(`SELECT id,start_ts,duration FROM slots WHERE user_id=? AND booked=0 AND start_ts>? ORDER BY start_ts LIMIT 30`).all(u.id, new Date().toISOString());
  const reviews = db.prepare(`SELECT r.rating,r.comment,r.created_at,us.name reviewer FROM reviews r JOIN users us ON us.id=r.reviewer_id WHERE reviewee_id=? ORDER BY r.id DESC LIMIT 10`).all(u.id);
  res.json({ ...publicUser(u), slots, reviewList: reviews });
}));
app.get('/api/leaderboard', auth, wrap((req, res) => {
  res.json(db.prepare('SELECT * FROM users ORDER BY xp DESC LIMIT 10').all().map((u) => publicUser(u)));
}));
app.get('/api/stats', wrap((req, res) => {
  const c = (sql) => db.prepare(sql).get().c;
  res.json({ users: c('SELECT COUNT(*) c FROM users'), mentors: c(`SELECT COUNT(*) c FROM users WHERE role='professional'`),
    sessions: c(`SELECT COUNT(*) c FROM bookings WHERE status='completed'`) });
}));

// ---------- availability slots ----------
app.get('/api/my/slots', auth, wrap((req, res) => {
  res.json(db.prepare('SELECT * FROM slots WHERE user_id=? AND start_ts>? ORDER BY start_ts').all(req.user.id, new Date().toISOString()));
}));
app.post('/api/slots', auth, wrap((req, res) => {
  const t = new Date(req.body.start); const dur = [15, 30, 45, 60].includes(+req.body.duration) ? +req.body.duration : 30;
  if (isNaN(t) || t < new Date()) return res.status(400).json({ error: 'Pick a future date and time' });
  const iso = t.toISOString();
  const clash = db.prepare('SELECT 1 FROM slots WHERE user_id=? AND start_ts=?').get(req.user.id, iso);
  if (clash) return res.status(409).json({ error: 'You already have a slot at that time' });
  db.prepare('INSERT INTO slots(user_id,start_ts,duration) VALUES(?,?,?)').run(req.user.id, iso, dur);
  res.json({ ok: true });
}));
app.delete('/api/slots/:id', auth, wrap((req, res) => {
  const r = db.prepare('DELETE FROM slots WHERE id=? AND user_id=? AND booked=0').run(+req.params.id, req.user.id);
  res.json({ ok: r.changes > 0 });
}));

// ---------- bookings ----------
const bookingView = (b, me) => {
  const mentor = getUser(b.mentor_id), learner = getUser(b.learner_id);
  const slot = db.prepare('SELECT start_ts,duration FROM slots WHERE id=?').get(b.slot_id);
  const myReview = db.prepare('SELECT 1 x FROM reviews WHERE booking_id=? AND reviewer_id=?').get(b.id, me);
  return { id: b.id, topic: b.topic, message: b.message, mode: b.mode, swapSkill: b.swap_skill, status: b.status,
    start: slot.start_ts, duration: slot.duration, mentor: { id: mentor.id, name: mentor.name, role: mentor.role, verified: !!mentor.verified },
    learner: { id: learner.id, name: learner.name, role: learner.role, verified: !!learner.verified },
    iAmMentor: b.mentor_id === me, reviewed: !!myReview };
};
app.post('/api/bookings', auth, wrap((req, res) => {
  const slot = db.prepare('SELECT * FROM slots WHERE id=?').get(+req.body.slotId);
  if (!slot || slot.booked || slot.start_ts < new Date().toISOString()) return res.status(400).json({ error: 'Slot not available' });
  if (slot.user_id === req.user.id) return res.status(400).json({ error: "You can't book your own slot" });
  const topic = str(req.body.topic, 120); if (!topic) return res.status(400).json({ error: 'Tell the mentor what you want to learn' });
  const mode = req.body.mode === 'swap' ? 'swap' : 'learn'; const swapSkill = str(req.body.swapSkill, 60);
  if (mode === 'swap' && !swapSkill) return res.status(400).json({ error: 'Which skill will you teach in return?' });
  const room = 'knowloop-' + crypto.randomBytes(8).toString('hex');
  const tx = db.transaction(() => {
    const claimed = db.prepare('UPDATE slots SET booked=1 WHERE id=? AND booked=0').run(slot.id);
    if (!claimed.changes) throw new Error('taken');
    return db.prepare('INSERT INTO bookings(slot_id,mentor_id,learner_id,topic,message,mode,swap_skill,room) VALUES(?,?,?,?,?,?,?,?)')
      .run(slot.id, slot.user_id, req.user.id, topic, str(req.body.message, 500), mode, swapSkill, room).lastInsertRowid;
  });
  try { res.json({ id: tx() }); } catch { res.status(409).json({ error: 'Someone just booked that slot' }); }
}));
app.get('/api/bookings', auth, wrap((req, res) => {
  const rows = db.prepare('SELECT * FROM bookings WHERE mentor_id=? OR learner_id=? ORDER BY id DESC').all(req.user.id, req.user.id);
  res.json(rows.map((b) => bookingView(b, req.user.id)));
}));
function myBooking(req, res) {
  const b = db.prepare('SELECT * FROM bookings WHERE id=?').get(+req.params.id);
  if (!b || (b.mentor_id !== req.user.id && b.learner_id !== req.user.id)) { res.status(404).json({ error: 'Not found' }); return null; }
  return b;
}
app.patch('/api/bookings/:id', auth, wrap((req, res) => {
  const b = myBooking(req, res); if (!b) return;
  const to = req.body.status, isMentor = b.mentor_id === req.user.id;
  const free = () => db.prepare('UPDATE slots SET booked=0 WHERE id=?').run(b.slot_id);
  if (to === 'accepted' && isMentor && b.status === 'pending') db.prepare(`UPDATE bookings SET status='accepted' WHERE id=?`).run(b.id);
  else if (to === 'declined' && isMentor && b.status === 'pending') { db.prepare(`UPDATE bookings SET status='declined' WHERE id=?`).run(b.id); free(); }
  else if (to === 'cancelled' && ['pending', 'accepted'].includes(b.status)) { db.prepare(`UPDATE bookings SET status='cancelled' WHERE id=?`).run(b.id); free(); }
  else if (to === 'completed' && b.status === 'accepted') {
    db.transaction(() => {
      db.prepare(`UPDATE bookings SET status='completed' WHERE id=?`).run(b.id);
      const swap = b.mode === 'swap' ? 25 : 0; // XP: teaching earns more than learning; swaps earn a bonus
      db.prepare('UPDATE users SET xp=xp+? WHERE id=?').run(50 + swap, b.mentor_id);
      db.prepare('UPDATE users SET xp=xp+? WHERE id=?').run(20 + swap, b.learner_id);
    })();
  } else return res.status(400).json({ error: 'Not allowed in the current state' });
  res.json({ ok: true });
}));
app.get('/api/bookings/:id/room', auth, wrap((req, res) => {
  const b = myBooking(req, res); if (!b) return;
  if (!['accepted', 'completed'].includes(b.status)) return res.status(400).json({ error: 'Session not confirmed yet' });
  res.json({ ...bookingView(b, req.user.id), room: b.room, notes: b.notes });
}));
app.put('/api/bookings/:id/notes', auth, wrap((req, res) => {
  const b = myBooking(req, res); if (!b) return;
  db.prepare('UPDATE bookings SET notes=? WHERE id=?').run(str(req.body.notes, 5000), b.id); res.json({ ok: true });
}));
app.get('/api/bookings/:id/messages', auth, wrap((req, res) => {
  const b = myBooking(req, res); if (!b) return;
  res.json(db.prepare('SELECT id,sender_id,body,created_at FROM messages WHERE booking_id=? AND id>? ORDER BY id').all(b.id, +req.query.after || 0));
}));
app.post('/api/bookings/:id/messages', auth, wrap((req, res) => {
  const b = myBooking(req, res); if (!b) return;
  const body = str(req.body.body, 1000); if (!body) return res.status(400).json({ error: 'Empty message' });
  db.prepare('INSERT INTO messages(booking_id,sender_id,body) VALUES(?,?,?)').run(b.id, req.user.id, body); res.json({ ok: true });
}));
app.post('/api/bookings/:id/review', auth, wrap((req, res) => {
  const b = myBooking(req, res); if (!b) return;
  if (b.status !== 'completed') return res.status(400).json({ error: 'Session not completed' });
  const rating = +req.body.rating; if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Rating 1-5' });
  const other = b.mentor_id === req.user.id ? b.learner_id : b.mentor_id;
  try { db.prepare('INSERT INTO reviews(booking_id,reviewer_id,reviewee_id,rating,comment) VALUES(?,?,?,?,?)').run(b.id, req.user.id, other, rating, str(req.body.comment, 400)); }
  catch { return res.status(409).json({ error: 'Already reviewed' }); }
  db.prepare('UPDATE users SET xp=xp+10 WHERE id=?').run(req.user.id);
  res.json({ ok: true });
}));

// ---------- skill request board ----------
app.get('/api/requests', auth, wrap((req, res) => {
  const rows = db.prepare(`SELECT * FROM requests WHERE status='open' ORDER BY id DESC LIMIT 50`).all();
  res.json(rows.map((r) => ({ id: r.id, skill: r.skill, details: r.details, created_at: r.created_at, user: publicUser(getUser(r.user_id)),
    offers: db.prepare('SELECT COUNT(*) c FROM offers WHERE request_id=?').get(r.id).c,
    iOffered: !!db.prepare('SELECT 1 x FROM offers WHERE request_id=? AND user_id=?').get(r.id, req.user.id) })));
}));
app.post('/api/requests', auth, wrap((req, res) => {
  const skill = str(req.body.skill, 60); if (!skill) return res.status(400).json({ error: 'Skill required' });
  db.prepare('INSERT INTO requests(user_id,skill,details) VALUES(?,?,?)').run(req.user.id, skill, str(req.body.details, 400)); res.json({ ok: true });
}));
app.post('/api/requests/:id/offer', auth, wrap((req, res) => {
  const r = db.prepare('SELECT * FROM requests WHERE id=?').get(+req.params.id);
  if (!r || r.user_id === req.user.id) return res.status(400).json({ error: 'Cannot offer on this request' });
  try { db.prepare('INSERT INTO offers(request_id,user_id,message) VALUES(?,?,?)').run(r.id, req.user.id, str(req.body.message, 300)); }
  catch { return res.status(409).json({ error: 'Already offered' }); }
  res.json({ ok: true });
}));
app.get('/api/requests/mine', auth, wrap((req, res) => {
  const rows = db.prepare('SELECT * FROM requests WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  res.json(rows.map((r) => ({ ...r, offerList: db.prepare('SELECT o.message, o.user_id FROM offers o WHERE request_id=?').all(r.id)
    .map((o) => ({ message: o.message, user: publicUser(getUser(o.user_id)) })) })));
}));
app.delete('/api/requests/:id', auth, wrap((req, res) => {
  db.prepare(`UPDATE requests SET status='closed' WHERE id=? AND user_id=?`).run(+req.params.id, req.user.id); res.json({ ok: true });
}));

// ---------- safety & admin ----------
app.post('/api/report', auth, wrap((req, res) => {
  const reason = str(req.body.reason, 400); if (!reason || !getUser(+req.body.targetId)) return res.status(400).json({ error: 'Invalid report' });
  db.prepare('INSERT INTO reports(reporter_id,target_id,reason) VALUES(?,?,?)').run(req.user.id, +req.body.targetId, reason); res.json({ ok: true });
}));
const adminOnly = (req, res, next) => (ADMIN_EMAIL && req.user.email === ADMIN_EMAIL) ? next() : res.status(403).json({ error: 'Admins only' });
app.get('/api/admin/overview', auth, adminOnly, wrap((req, res) => {
  res.json({ pending: db.prepare(`SELECT id,name,email,org,linkedin FROM users WHERE verified=0 AND role='professional'`).all(),
    reports: db.prepare('SELECT * FROM reports ORDER BY id DESC LIMIT 30').all() });
}));
app.post('/api/admin/verify/:id', auth, adminOnly, wrap((req, res) => {
  db.prepare('UPDATE users SET verified=1 WHERE id=?').run(+req.params.id); res.json({ ok: true });
}));

app.use((req, res) => req.path.startsWith('/api') ? res.status(404).json({ error: 'Not found' }) : res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.listen(PORT, () => console.log(`KnowLoop running on http://localhost:${PORT}`));
