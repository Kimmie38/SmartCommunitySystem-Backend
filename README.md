# Smart Community Security and Emergency Response System — Backend (MongoDB)

Backend API for the project proposal (Computer Science, Case Study: Nigeria).

## Stack
- Node.js + Express
- MongoDB + Mongoose (with 2dsphere geospatial indexes for location-based alerts)
- JWT authentication, bcrypt password hashing
- Two roles: `resident` and `admin`

## Setup
```bash
pnpm install
pnpm start               # or: pnpm dev (auto-restart on change)
```
Server runs on `http://localhost:4000` by default.

A `.env` file is already included with a generated `JWT_SECRET` and `ADMIN_SIGNUP_CODE` — you only need to fill in `MONGODB_URI` with your real Atlas connection string (see below). `.env` is git-ignored, so your credentials won't get committed. `.env.example` is kept as a template/reference.

### Connecting to MongoDB Atlas
1. [cloud.mongodb.com](https://cloud.mongodb.com) → **Build a Database** → **M0 Free** tier → create the cluster.
2. **Database Access** → add a database user (username + password, "Read and write to any database").
3. **Network Access** → add `0.0.0.0/0` (allow from anywhere) to start; lock this down to your server's IP later.
4. **Database** → **Connect** → **Drivers** → **Node.js** → copy the connection string.
5. Paste it into `.env` as `MONGODB_URI`, filling in your real username/password and adding the database name, e.g.:
   ```
   MONGODB_URI=mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/smart_community_security?retryWrites=true&w=majority
   ```

Other options if you'd rather not use Atlas:
- **Local**: install MongoDB Community Server, run `mongod`, use `mongodb://127.0.0.1:27017/smart_community_security`
- **Docker**: `docker run -d -p 27017:27017 --name mongo mongo:7`

> Note: this backend was built and syntax/logic-verified in a sandboxed environment without outbound access to MongoDB's servers (Atlas's `mongodb.net` domain isn't reachable from there), so it hasn't been run against a live database yet. All schema validation, JWT signing, password hashing, and geo-calculation logic were unit-tested directly. Run `pnpm start` with your real `MONGODB_URI` to do the first full live test — flag anything unexpected and I'll fix it fast.

## Auth model
- Anyone can register as a `resident` via `POST /api/auth/register`.
- To register as `admin`, include the correct `adminCode` (matches `ADMIN_SIGNUP_CODE` in `.env`) in the register request. In production, admin accounts should be created by an existing admin instead — this is a simple bootstrap mechanism.
- All protected routes require `Authorization: Bearer <token>`.

## Privacy design
Residents never see who reported an incident or its exact coordinates. `GET /api/reports/nearby` returns only: emergency type, a rough area (estate name or coordinates rounded to ~1km), status, and timestamp. Full detail (reporter name, phone, exact lat/lng) is only visible to `admin` accounts, or to the resident who filed that specific report.

## API Reference

### Auth
| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/api/auth/register` | public | Register a resident (or admin with `adminCode`) |
| POST | `/api/auth/login` | public | Login with `phone` + `password` |

### Users
| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/api/users/me` | authenticated | Get own profile |
| PATCH | `/api/users/me` | authenticated | Update estate, home location, alert preferences |

### Reports (Resident)
| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/api/reports` | resident | Submit an emergency report (`type`, `description`, `lat`, `lng`) |
| GET | `/api/reports/mine` | resident | Own reports + full status history |
| GET | `/api/reports/nearby` | resident | Anonymized nearby alert feed |
| PATCH | `/api/reports/nearby/:id/seen` | resident | Mark an alert as seen |

Report `type` must be one of: `robbery`, `fire`, `accident`, `medical`, `domestic_threat`, `suspicious_activity`, `other`.

### Reports (Admin)
| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/api/reports` | admin | List all reports, filter by `type`, `status`, `estate`, `from`, `to` |
| GET | `/api/reports/:id` | admin (or owning resident) | Full report detail incl. reporter identity |
| PATCH | `/api/reports/:id/status` | admin | Update status: `new` → `acknowledged` → `in_progress` → `resolved` / `false_alarm` |

### Admin
| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/api/admin/analytics` | admin | Counts by type/status, estate hotspots, recent reports |

## Nearby alert logic
Each resident sets `alertPref` to `radius`, `estate`, or `both` (default), plus `alertRadiusKm` (default 1.5km). When a report is submitted:
- **Radius match**: MongoDB's `$geoNear` aggregation (backed by a `2dsphere` index on `homeLocationGeo`) finds residents near the report location; each candidate is then checked against their *own* `alertRadiusKm`, since Mongo's native `$maxDistance` can't vary per document in one query.
- **Estate match**: resident's registered `estate` equals the reporter's estate.
- **`both`**: alerted if either matches.

An `AlertDispatch` document is created per matched resident (upserted so a resident is never double-alerted for the same report), which powers the `/api/reports/nearby` feed and its `seen` (read/unread) state.

## Data model (Mongoose collections)
- **User** — name, phone (unique), passwordHash, role, estate, homeLocation `{lat, lng}` + mirrored `homeLocationGeo` (GeoJSON Point, 2dsphere-indexed), alertPref, alertRadiusKm, emergencyContact
- **Report** — reporter (ref User), type, description, location `{lat, lng}` + mirrored `locationGeo` (2dsphere-indexed), estate, roughArea, status, embedded `statusHistory[]` (status, note, changedBy, changedAt)
- **AlertDispatch** — report (ref), recipient (ref User), seen — unique compound index on `(report, recipient)`

## Next steps (not yet built)
- Frontend (mobile) consuming this API
- Push notifications (currently alerts are pull-based via `/api/reports/nearby`)
- Map view for admin dashboard (lat/lng is already returned, just needs rendering)
- Rate limiting / abuse prevention on report submission
- A live end-to-end test run against your actual MongoDB instance
