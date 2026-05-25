# 🍔 Easy Eats — MongoDB Edition (v2.0)

Campus food ordering app. **No Docker required** — runs directly on your machine.

---

## Prerequisites

| Tool | Min version | Download |
|---|---|---|
| **Python** | 3.10+ | https://python.org/downloads |
| **Node.js** | 18+ | https://nodejs.org |
| **MongoDB Atlas** | free M0 | https://cloud.mongodb.com |

---

## Step 1 — Create MongoDB Atlas cluster (free)

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) → sign up
2. **Create a Cluster** → choose **M0 Free**
3. **Network Access** → Add IP → `0.0.0.0/0` (allow all, for dev)
4. **Database Access** → Add user → role: `readWriteAnyDatabase`
5. **Connect** → Drivers → Python → copy the URI

It looks like:
```
mongodb+srv://youruser:yourpassword@cluster0.abc123.mongodb.net/?retryWrites=true&w=majority
```

---

## Step 2 — Configure environment

Open **`backend/.env`** and paste your URI:

```env
MONGODB_URI=mongodb+srv://youruser:yourpassword@cluster0.abc123.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=easy_eats
JWT_SECRET=any-long-random-string
```

The **`frontend/.env`** works as-is for local dev (no changes needed).

---

## Step 3 — Start the app

### Mac / Linux — one command
```bash
bash start.sh
```
The script creates the Python venv, installs all packages, optionally seeds demo data, and launches both servers.

### Windows (PowerShell)
```powershell
.\start.ps1
```

### Windows (CMD / double-click)
```
start.bat
```

Both Windows options open the backend and frontend in **separate terminal windows**.

---

## Manual setup

### Backend
```bash
cd backend

python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate

pip install -r requirements.txt

# First time only — create DB indexes
python scripts/create_indexes.py

# Optional — populate with demo data
python scripts/seed_demo.py

# Start
uvicorn app.main:app --reload
# API: http://localhost:8000
# Docs: http://localhost:8000/docs
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# App: http://localhost:5173
```

---

## Demo accounts

| Role    | Email              | Password | Dashboard       |
|---------|--------------------|----------|-----------------|
| Student | student@demo.com   | demo1234 | /home           |
| Owner   | owner@demo.com     | demo1234 | /owner          |
| Kitchen | kitchen@demo.com   | demo1234 | /kitchen        |
| Admin   | admin@demo.com     | demo1234 | /admin          |

---

## Project structure

```
easy-eats-mongodb/
├── start.sh              ← Mac/Linux one-command launcher
├── start.ps1             ← Windows PowerShell launcher
├── start.bat             ← Windows CMD launcher
│
├── backend/
│   ├── .env              ← ✏ set MONGODB_URI here
│   ├── requirements.txt
│   ├── scripts/
│   │   ├── create_indexes.py   ← run once in production
│   │   └── seed_demo.py        ← demo data
│   └── app/
│       ├── main.py             ← FastAPI entry point
│       ├── database.py         ← Motor + Beanie connection
│       ├── core/config.py      ← reads .env
│       ├── models/
│       │   ├── user.py         ← users collection
│       │   ├── stall.py        ← stalls (categories, is_open)
│       │   ├── menu_item.py    ← items (is_available, price)
│       │   ├── order.py        ← orders (embedded items)
│       │   └── review.py
│       ├── routes/
│       │   ├── auth.py         ← /auth/register  /auth/login
│       │   ├── stalls.py       ← /stalls/
│       │   ├── menu.py         ← /menu/
│       │   ├── orders.py       ← /orders/
│       │   ├── reviews.py      ← /reviews/
│       │   └── admin.py        ← /admin/
│       ├── services/
│       │   └── ai_predictor.py ← prep-time heuristic
│       └── utils/
│           └── security.py     ← JWT + bcrypt + role guards
│
└── frontend/
    ├── .env              ← leave as-is for local dev
    ├── vite.config.js    ← dev proxy → localhost:8000
    ├── package.json
    └── src/
        ├── api.js
        ├── App.jsx
        ├── context/CartContext.jsx
        ├── hooks/
        │   ├── useAuth.js
        │   └── useOrderPolling.js
        ├── components/
        │   ├── BottomNav.jsx
        │   └── ChatBot.jsx     ← AI food assistant (Claude API)
        └── pages/
            ├── Login.jsx
            ├── Home.jsx           ← stall listing + filters
            ├── Restaurant.jsx     ← per-stall menu with DB categories
            ├── Cart.jsx
            ├── TrackOrder.jsx     ← live countdown + progress stepper
            ├── MyOrders.jsx
            ├── OwnerPortal.jsx    ← manage categories + availability
            ├── KitchenDashboard.jsx ← real-time order board
            └── AdminPanel.jsx
```

---

## API quick reference

Full interactive docs at **http://localhost:8000/docs**

```
POST  /auth/register
POST  /auth/login

GET   /stalls/                       list stalls (?cuisine=Burgers&open_only=true)
GET   /stalls/{id}                   detail + menu grouped by category
PUT   /stalls/{id}/toggle            open/close  [owner]
PUT   /stalls/{id}/categories        set tabs    [owner]

GET   /menu/{stall_id}/available     available items
PUT   /menu/item/{id}/toggle         mark sold-out  [kitchen]
POST  /menu/{stall_id}               add item       [owner]

POST  /orders/place                  place order → ETA + slot
GET   /orders/my                     order history
GET   /orders/{id}/track             live status
PUT   /orders/{id}/status            advance       [kitchen]
GET   /orders/analytics/{stall_id}   revenue data  [owner]

POST  /reviews/{stall_id}
GET   /reviews/{stall_id}
```

---

## Deploy to production (free)

### Backend → Railway
1. Push `backend/` to GitHub
2. [railway.app](https://railway.app) → New → Deploy from GitHub
3. Set env vars: `MONGODB_URI`, `JWT_SECRET`, `MONGODB_DB_NAME`, `ALLOWED_ORIGINS`
4. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### Frontend → Vercel
1. Push `frontend/` to GitHub
2. [vercel.com](https://vercel.com) → New Project → import
3. Set env var: `VITE_API_URL=https://your-backend.up.railway.app`

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ModuleNotFoundError` | Activate venv: `source .venv/bin/activate` |
| MongoDB connection refused | Check `MONGODB_URI` in `backend/.env` — no spaces around `=` |
| Atlas `Network Access` error | Add your IP in Atlas → Network Access |
| Port 8000 in use | `lsof -ti:8000 \| xargs kill` (Mac/Linux) |
| CORS error | Add `http://localhost:5173` to `ALLOWED_ORIGINS` in `backend/.env` |
| Windows script blocked | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
