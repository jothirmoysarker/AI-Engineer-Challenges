# ServeHub — Technical Explanation

## 1. Engineering Workflow: AI-Directed Development

### Prompt Structure

The build was driven by a single high-level specification prompt, deliberately written in outcome terms rather than implementation terms:

> *"Build the core backend, frontend, and database functionality of a multi-vendor service marketplace... supporting three distinct system roles: Admin, Vendor, and End-User... a complete checkout journey passing through a mock payment gateway operating inside a sandbox/test environment."*

This pattern — stating **what** the system must do, not **how** — is intentional. It leaves the AI free to select appropriate primitives (Express, JWT, bcrypt, sql.js) and architecture (SPA with hash routing, synchronous DB wrapper) without being anchored to a prescriptive tech stack that might not resolve cleanly in the target environment.

Subsequent prompts were **diagnostic, not instructional**. Rather than saying "fix the database", the intervention was: "here is the error output — what is happening?" This keeps the AI in a reasoning loop rather than a guess-and-patch loop.

### Where AI Succeeded

**Architecture design.** The AI correctly identified that a pure-WASM SQLite (sql.js) eliminates the native-compilation problem for `better-sqlite3` on Windows — a non-obvious solution that requires understanding both the Node.js addon build chain and the available pure-JS alternatives.

**The synchronous wrapper.** sql.js uses a step-iterator pattern (`stmt.step()` / `stmt.getAsObject()`) rather than the familiar `.get()` / `.all()` / `.run()` interface. The AI designed a thin compatibility wrapper that maps the better-sqlite3 API onto sql.js internals, so all application code could be written in the idiomatic style without knowing the underlying engine.

**SQL construction.** Every JOIN query — services with categories, vendors, users; orders with customer details and service names — was written correctly first time, including the left-join aggregate for category service counts.

**Role-gated route generation.** The full set of RBAC-protected endpoints (26 routes across auth, categories, services, vendors, orders, admin) was generated in one pass with consistent middleware chaining.

**SPA routing.** The hash-free `history.pushState` router with a catch-all Express `GET *` fallback was wired up correctly so deep-linked URLs survive a page refresh.

### Where AI Failed or Required Manual Intervention

**`DEFAULT (datetime('now'))` in DDL.** The AI initially wrote SQL schema with `DEFAULT (datetime('now'))` on timestamp columns. sql.js rejects function-based column defaults with "default value of column is not constant". This is a documented sql.js limitation that the model was unaware of. Fix: remove all function defaults from DDL and pass ISO timestamps explicitly from application code via a `now()` helper.

**`£` as a JavaScript identifier.** The currency formatting helper was initially named `function £(n)`. The pound sign (U+00A3) is not in the Unicode `ID_Start` set, so it is not a valid JavaScript identifier in any engine. Because the error is a silent parse failure (the entire `<script>` block is discarded), the symptom — a blank page with only the static HTML navbar logo visible — looked like a rendering or routing problem rather than a syntax error. Diagnosis required extracting the script block to a temporary file and running `node --check`, which immediately surfaced `SyntaxError: Invalid or unexpected token` at the `£` character. All 17 call sites were renamed to `gbp(n)`.

**Write-tool truncation.** Large files written via the file-write tool were silently truncated (seed.js cut off mid-function; database.js lost its closing lines). The workaround was to write files via bash heredoc (`cat > file << 'EOF'`) or Python scripts, which buffer the full content before writing.

**Unicode smart quotes in seed.js.** The seed data initially contained curly apostrophes (`'`) in string literals, causing a `SyntaxError: Invalid or unexpected token` at runtime. The file was rewritten using only ASCII-safe quotes.

**Port collision.** Running `node server.js` twice leaves the second instance unable to bind port 3000 (`EADDRINUSE`). Standard fix: `taskkill /PID <pid> /F` on Windows, or launch with `PORT=3001`.

---

## 2. Database Schema & Entity-Relationship Diagram

### Schema Overview

The database uses five tables with the following structure:

```
┌─────────────────────────────────────────────┐
│                  categories                 │
├────────────┬────────────────────────────────┤
│ id         │ INTEGER PK AUTOINCREMENT       │
│ name       │ TEXT NOT NULL UNIQUE           │
│ icon       │ TEXT NOT NULL (emoji)          │
│ description│ TEXT                           │
└─────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│                    users                      │
├───────────────┬───────────────────────────────┤
│ id            │ TEXT PK (UUID v4)             │
│ email         │ TEXT NOT NULL UNIQUE          │
│ password_hash │ TEXT NOT NULL (bcrypt/10)     │
│ role          │ TEXT  'user'|'vendor'|'admin' │
│ full_name     │ TEXT NOT NULL                 │
│ phone         │ TEXT                          │
│ is_active     │ INTEGER  1=active, 0=banned   │
│ created_at    │ TEXT (ISO 8601)               │
└───────────────┴───────────────────────────────┘

┌───────────────────────────────────────────────┐
│                   vendors                     │
├────────────────┬──────────────────────────────┤
│ id             │ TEXT PK (UUID v4)            │
│ user_id        │ TEXT FK → users.id (UNIQUE)  │
│ business_name  │ TEXT NOT NULL                │
│ description    │ TEXT                         │
│ category_id    │ INTEGER FK → categories.id   │
│ city           │ TEXT                         │
│ rating         │ REAL  (0.0 – 5.0)            │
│ rating_count   │ INTEGER                      │
│ is_verified    │ INTEGER  admin-controlled    │
│ joined_at      │ TEXT (ISO 8601)              │
└────────────────┴──────────────────────────────┘

┌───────────────────────────────────────────────┐
│                   services                    │
├──────────────┬────────────────────────────────┤
│ id           │ TEXT PK (UUID v4)              │
│ vendor_id    │ TEXT FK → vendors.id           │
│ category_id  │ INTEGER FK → categories.id     │
│ name         │ TEXT NOT NULL                  │
│ description  │ TEXT                           │
│ price        │ REAL NOT NULL                  │
│ price_unit   │ TEXT  'fixed'|'hourly'         │
│ duration_min │ INTEGER (nullable)             │
│ is_active    │ INTEGER  soft-delete flag      │
│ created_at   │ TEXT (ISO 8601)                │
└──────────────┴────────────────────────────────┘

┌──────────────────────────────────────────────┐
│                    orders                    │
├────────────────┬─────────────────────────────┤
│ id             │ TEXT PK (UUID v4)           │
│ user_id        │ TEXT FK → users.id          │
│ service_id     │ TEXT FK → services.id       │
│ vendor_id      │ TEXT FK → vendors.id        │
│ status         │ TEXT  pending|confirmed|    │
│                │       in_progress|completed │
│                │       |cancelled            │
│ total_price    │ REAL (snapshotted at order) │
│ payment_status │ TEXT  'unpaid'|'paid'       │
│ payment_ref    │ TEXT  SANDBOX-{ts}-{uuid}   │
│ scheduled_at   │ TEXT (ISO 8601)             │
│ address        │ TEXT                        │
│ notes          │ TEXT                        │
│ created_at     │ TEXT (ISO 8601)             │
│ updated_at     │ TEXT (ISO 8601)             │
└────────────────┴─────────────────────────────┘
```

### Entity-Relationship Diagram

```
                    ┌──────────────┐
                    │  categories  │
                    │  ──────────  │
                    │  id (PK)     │
                    │  name        │
                    │  icon        │
                    └──────┬───────┘
                           │  1
                           │
              ┌────────────┴───────────┐
              │ 0..N                   │ 0..N
              │                        │
      ┌───────┴──────┐        ┌────────┴─────┐
      │   vendors    │  1     │   services   │
      │  ──────────  ├────────┤  ──────────  │
      │  id (PK)     │  0..N  │  id (PK)     │
      │  user_id(FK) │        │  vendor_id   │
      │  business_   │        │    (FK)      │
      │  name        │        │  category_id │
      │  city        │        │    (FK)      │
      │  rating      │        │  name        │
      │  is_verified │        │  price       │
      └──────┬───────┘        │  price_unit  │
             │ 1              │  is_active   │
             │                └──────┬───────┘
      ┌──────┴───────┐               │ 1
      │    users     │               │
      │  ──────────  │        ┌──────┴───────┐
      │  id (PK)     │        │    orders    │
      │  email       │  1     │  ──────────  │
      │  password_   ├────────┤  id (PK)     │
      │  hash        │  0..N  │  user_id(FK) │
      │  role        │        │  service_id  │
      │  is_active   │        │    (FK)      │
      └──────────────┘        │  vendor_id   │
                              │    (FK)      │
                              │  status      │
                              │  total_price │
                              │  payment_    │
                              │  status      │
                              │  payment_ref │
                              └──────────────┘
```

### Key Design Decisions

**UUIDs not auto-increment integers for application PKs.** `users`, `vendors`, `services`, and `orders` all use UUID v4 string PKs. This avoids leaking sequential IDs in URLs (which would expose record counts and allow enumeration attacks), and means IDs can be generated client-side or in seed scripts without a round-trip to the database.

**`vendor_id` denormalised onto `orders`.** Even though `vendor_id` is derivable via `orders.service_id → services.vendor_id`, it is stored directly on `orders`. This means vendor dashboard queries (`WHERE vendor_id = ?`) require no join and cannot be broken if a service is reassigned.

**`total_price` snapshotted at order creation.** The price on the order record is copied from the service at the moment of booking. If the vendor subsequently edits the service price, existing orders retain their original agreed price — correct commercial behaviour.

**Soft-delete for services.** `services.is_active = 0` deactivates a listing without deleting the row. Active orders referencing that service remain intact and queryable; historical order records are not orphaned.

**No foreign key enforcement.** sql.js supports `PRAGMA foreign_keys = ON` but it was not enabled here. Referential integrity is maintained at the application layer (the API validates `service_id` exists before creating an order, etc.). This is a known trade-off for a prototype — production would enable `PRAGMA foreign_keys = ON`.

---

## 3. State Management & Route Protection

### Frontend State (Single-Page Application)

All client-side application state is held in a single plain object:

```javascript
const state = {
  token: localStorage.getItem('token') || null,
  user:  JSON.parse(localStorage.getItem('user') || 'null'),
  cart:  null,   // the service being checked out (in-memory, not persisted)
};
```

On page load, `token` and `user` are rehydrated from `localStorage` so the session survives a browser refresh without requiring a round-trip to `/api/auth/me`. `cart` is intentionally not persisted — it holds only the service selected for the current checkout flow, and is cleared on navigation away.

#### Authentication state transitions

| Event | State change |
|---|---|
| Successful login/register | `state.token` and `state.user` set; both written to `localStorage` |
| Sign-out | `state.token`, `state.user`, `state.cart` all nulled; `localStorage` keys removed |
| JWT expiry (401 from API) | `api()` helper clears state and redirects to `/login` |

#### The `api()` helper

All HTTP calls go through a single wrapper:

```javascript
async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    // Token expired or invalid — force re-login
    state.token = null; state.user = null;
    localStorage.removeItem('token'); localStorage.removeItem('user');
    route('/login'); return null;
  }
  return res.ok ? res.json() : res.json().then(e => Promise.reject(e));
}
```

This means expired tokens are handled transparently: any protected API call that returns 401 automatically signs the user out and redirects, regardless of which view triggered it.

### Frontend Route Protection

The `reqAuth(role)` guard function is called at the top of every protected view handler:

```javascript
function reqAuth(role) {
  if (!state.user) { route('/login'); return false; }
  if (role && state.user.role !== role && state.user.role !== 'admin') {
    toast('Access denied', 'error'); route('/'); return false;
  }
  return true;
}
```

Usage in route handlers:

```javascript
routes['dashboard'] = async () => {
  if (!reqAuth('user')) return;
  // render user dashboard...
};

routes['vendor'] = async () => {
  if (!reqAuth('vendor')) return;
  // render vendor dashboard...
};

routes['admin'] = async () => {
  if (!reqAuth('admin')) return;
  // render admin panel...
};
```

Admin always passes role checks (the `|| state.user.role !== 'admin'` condition), so an admin account can visit any role-gated view.

The navigation bar itself is role-conditional: vendor and admin dashboard links only render if the current `state.user` has the matching role, so an end-user never sees the Vendor Dashboard link at all.

### Backend Route Protection (API Layer)

The backend enforces access independently of the frontend — the frontend guards are UX convenience, not a security boundary.

**Middleware chain.** Express routes are composed as a chain of middleware functions:

```
[authenticate] → [requireRole('vendor')] → route handler
```

`authenticate` verifies the JWT signature and populates `req.user`. If the token is absent or forged, it returns `401` immediately. `requireRole(...roles)` checks `req.user.role` against the permitted set and returns `403` if the role is not in the list.

**Route protection matrix:**

| Endpoint group | Middleware | Permitted roles |
|---|---|---|
| `POST /api/auth/register` | none | public |
| `POST /api/auth/login` | none | public |
| `GET /api/categories` | none | public |
| `GET /api/services` | none | public |
| `GET /api/services/:id` | none | public |
| `GET /api/auth/me` | authenticate | any authenticated |
| `PUT /api/auth/me` | authenticate | any authenticated |
| `POST /api/orders` | authenticate + requireRole | user, admin |
| `GET /api/orders` | authenticate | returns only caller's orders |
| `GET /api/orders/:id` | authenticate | owner, vendor, or admin |
| `POST /api/orders/:id/payment` | authenticate | order owner or admin |
| `DELETE /api/orders/:id` | authenticate | order owner or admin |
| `POST /api/vendors` | authenticate | any authenticated |
| `GET /api/vendors/me` | authenticate + requireRole | vendor, admin |
| `GET /api/vendors/me/services` | authenticate + requireRole | vendor, admin |
| `POST /api/vendors/me/services` | authenticate + requireRole | vendor, admin |
| `PUT /api/vendors/me/services/:id` | authenticate + requireRole | vendor, admin |
| `DELETE /api/vendors/me/services/:id` | authenticate + requireRole | vendor, admin |
| `GET /api/vendors/me/orders` | authenticate + requireRole | vendor, admin |
| `PUT /api/vendors/me/orders/:id` | authenticate + requireRole | vendor, admin |
| `GET /api/vendors/me/stats` | authenticate + requireRole | vendor, admin |
| `GET /api/admin/stats` | authenticate + requireRole | admin only |
| `GET /api/admin/users` | authenticate + requireRole | admin only |
| `PUT /api/admin/users/:id` | authenticate + requireRole | admin only |
| `GET /api/admin/orders` | authenticate + requireRole | admin only |
| `PUT /api/admin/vendors/:id/verify` | authenticate + requireRole | admin only |

**Object-level ownership checks.** `requireRole` guards the *class* of resource. Within the route handler, ownership is verified against the *specific record*. For example, on `GET /api/orders/:id`:

```javascript
// Admin can see any order
// Vendor can only see orders belonging to their vendor profile
// User can only see their own orders
if (req.user.role !== 'admin'
    && order.user_id !== req.user.id
    && (!vendor || order.vendor_id !== vendor.id)) {
  return res.status(403).json({ error: 'Access denied' });
}
```

Similarly, `PUT /api/vendors/me/services/:id` first looks up the vendor by `user_id = req.user.id`, then verifies the service's `vendor_id` matches — a vendor cannot edit another vendor's service even if they know the service UUID.

### Mock Payment Gateway

The sandbox payment endpoint (`POST /api/orders/:id/payment`) implements a minimal but realistic test harness:

- Card number ending `0000` → HTTP 402, `decline_code: "insufficient_funds"`, `sandbox: true`
- Any other card → payment succeeds, `payment_ref` generated as `SANDBOX-{timestamp}-{UUID fragment}`, order `status` set to `confirmed`, `payment_status` set to `paid`
- Re-payment on an already-paid order → HTTP 409 `"Order already paid"`

The response always includes `sandbox: true` so consumers of the API can distinguish test transactions from real ones.
