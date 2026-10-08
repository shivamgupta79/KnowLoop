# KnowLoop 🔁
**Learn 1:1. Teach 1:1. Loop it.**
A free platform where college students book one-on-one sessions with industry professionals, learn from peers, and teach back through Skill Swaps.
Built for **Hack-Tic-Thon - Tech-Melange '26** (Open Innovation track).

## Features
- Two-way learning: professionals -> students and students -> students
- **Skill Swap** sessions (teach me X, I teach you Y)
- Smart matching from "can teach" / "want to learn" skills
- Live availability slots and one-click booking (double-booking safe)
- Built-in video room (Jitsi), session chat and shared notes
- Ratings, reviews, XP, levels, badges, leaderboard
- **Request Board** where learners post needs and mentors offer help
- Trust and safety: auto-verified student badge for college emails, admin-verified professionals, report button, rate limiting

## Run locally
```bash
git clone <your-repo-url> && cd knowloop
npm install
cp .env.example .env     # then edit JWT_SECRET
npm run seed             # optional demo data (password for all demo users: demo1234)
npm start                # http://localhost:3000
```
Demo logins: `ananya@demo.ac.in` (student), `aarav@demo.in` (professional). Needs Node 18+.

Set environment variables in your shell or host dashboard (`JWT_SECRET` is required in production; this app does not read `.env` automatically, so use `export $(cat .env | xargs)` locally or `node --env-file=.env src/server.js` on Node 20+).

## Deploy (free)
**Render:** New Web Service -> connect repo -> Build `npm install` -> Start `npm run seed && npm start` -> add env vars `JWT_SECRET`, `ADMIN_EMAIL`. Add a disk and set `DB_FILE=/var/data/knowloop.db` if you want data to survive restarts.
**Docker:** `docker build -t knowloop . && docker run -p 3000:3000 -v kl:/data -e JWT_SECRET=xxxx knowloop`

## Project structure
```
src/server.js   Express REST API (auth, mentors, slots, bookings, chat, reviews, requests, admin)
src/db.js       SQLite schema (better-sqlite3)
src/seed.js     Demo data
public/         Single-page frontend (index.html, style.css, app.js) - no build step
```

## API quick reference
`POST /api/auth/register|login` · `GET/PUT /api/me` · `GET /api/mentors` · `GET /api/recommendations` · `GET /api/users/:id`
`GET/POST/DELETE /api/slots` · `POST /api/bookings` · `PATCH /api/bookings/:id` · `GET /api/bookings/:id/room|messages` · `POST /api/bookings/:id/review`
`GET/POST /api/requests` · `POST /api/requests/:id/offer` · `GET /api/leaderboard` · `POST /api/report` · `GET /api/admin/overview`

## License
MIT
