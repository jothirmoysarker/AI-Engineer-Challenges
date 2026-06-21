# ServeHub — Multi-Vendor Service Marketplace

A full-stack service marketplace platform where customers can browse and book local services, vendors manage their listings and orders, and admins oversee the platform.

Built with Node.js + Express (backend), vanilla JS single-page app (frontend), and sql.js (pure WebAssembly SQLite — no native compilation required).

---

## Features

- **Three roles**: Admin, Vendor, End-User with role-based access control throughout
- **Service catalog**: 10 categories, search by keyword, category, and price range
- **Vendor dashboard**: list services, manage pricing, track incoming orders
- **User dashboard**: browse, book, and view order history
- **Checkout**: full booking flow with mock/sandbox payment gateway
- **Admin panel**: platform stats, user management, order overview, vendor verification

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Database | sql.js (pure WASM SQLite — no native build needed) |
| Auth | JWT (jsonwebtoken) + bcrypt (bcryptjs) |
| Frontend | Vanilla JS SPA with `history.pushState` routing |
| No build step | Single HTML file, zero bundler required |

---

## Prerequisites (Fresh Windows Machine)

You need two things installed before you can run this project.

### 1. Install Node.js

Node.js is the runtime that executes the server.

1. Go to **https://nodejs.org**
2. Download the **LTS** version (the button labelled "LTS — Recommended For Most Users")
3. Run the installer — click Next through all the defaults
4. When asked about "Tools for Native Modules", **you can leave it unchecked** — this project does not use native modules
5. Finish the install

Verify it worked — open **Command Prompt** (press `Win + R`, type `cmd`, press Enter) and run:

```
node --version
npm --version
```

Both should print a version number (e.g. `v22.x.x` and `10.x.x`).

### 2. Install Git

Git is needed to clone (download) the repository.

1. Go to **https://git-scm.com/download/win**
2. Download and run the installer
3. Click Next through all the defaults — the default options are fine
4. Finish the install

Verify it worked — in Command Prompt:

```
git --version
```

Should print something like `git version 2.x.x.windows.x`.

---

## Setup & Run

Open **Command Prompt** and run these commands one at a time:

### Step 1 — Clone the repository

```
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
```

Replace `YOUR_USERNAME/YOUR_REPO_NAME` with the actual GitHub path. Then move into the project folder:

```
cd YOUR_REPO_NAME
```

### Step 2 — Install dependencies

```
npm install
```

This downloads all required packages into a `node_modules` folder. It takes about 30–60 seconds on first run. You should see no errors — warnings are fine.

### Step 3 — Seed the database with demo data

```
node seed.js
```

This creates the database file (`marketplace.db.bin`) and populates it with 10 categories, 5 vendors, 20 services, and sample orders. You only need to run this once.

You will see output like:

```
Initialising database...
Seeding data...
  admin@marketplace.com / Admin@123
  alice@example.com / User@123
  bob@example.com   / User@123
  5 vendor accounts created
  20 services created
  5 sample orders created

Seed complete!
```

### Step 4 — Start the server

```
node server.js
```

You will see:

```
Initialising database...
Database ready
ServeHub running → http://localhost:3000
Sandbox mode: mock payment gateway active
```

### Step 5 — Open the app

Open any web browser and go to:

```
http://localhost:3000
```

The marketplace home page should load.

---

## Demo Accounts

| Role | Email | Password |
|---|---|---|
| Admin | admin@marketplace.com | Admin@123 |
| End-User | alice@example.com | User@123 |
| End-User | bob@example.com | User@123 |
| Vendor | sparkle@vendor.com | Vendor@123 |
| Vendor | pipepro@vendor.com | Vendor@123 |
| Vendor | volts@vendor.com | Vendor@123 |
| Vendor | greenthumb@vendor.com | Vendor@123 |
| Vendor | techfix@vendor.com | Vendor@123 |

---

## Mock Payment Gateway

The checkout uses a sandbox payment processor. **No real money is charged.**

- Enter any fake card details to simulate a successful payment
- To simulate a **declined card**, use a card number ending in `0000` (e.g. `4111 1111 1111 0000`)
- Successful payments generate a reference like `SANDBOX-1234567890-ABCD1234`

---

## Stopping the Server

In the Command Prompt window where the server is running, press:

```
Ctrl + C
```

---

## Restarting After a Reboot

You do not need to re-run `npm install` or `node seed.js` again. Just:

```
cd path\to\YOUR_REPO_NAME
node server.js
```

Then visit `http://localhost:3000`.

---

## Resetting the Database

If you want to start fresh (wipe all orders, users, etc.):

```
del marketplace.db.bin
node seed.js
```

---

## Project Structure

```
servehub/
├── server.js          # Express API — all routes and middleware
├── database.js        # sql.js initialisation and compatibility wrapper
├── seed.js            # Demo data — categories, vendors, services, orders
├── package.json       # Project metadata and dependency list
├── package-lock.json  # Exact dependency versions (do not delete)
└── public/
    └── index.html     # Entire frontend — SPA with inline CSS and JS
```

---

## Environment Variables (Optional)

The server works out of the box with safe defaults. For production use, you can override these by creating a `.env` file:

```
PORT=3000
JWT_SECRET=replace_this_with_a_long_random_string
```

> **Note**: The `.env` file is excluded from Git via `.gitignore`. Never commit your JWT secret to a public repository.

---

## Troubleshooting

**"node is not recognised as an internal or external command"**
Node.js is not installed or the installer did not add it to PATH. Re-run the Node.js installer and restart Command Prompt.

**"npm install" fails with errors about node-gyp or Python**
This should not happen with this project (sql.js is pure WASM). If it does, run `npm install --ignore-scripts` instead.

**"EADDRINUSE: address already in use :::3000"**
Another process is already using port 3000. Either stop it, or run the server on a different port:
```
set PORT=3001 && node server.js
```
Then visit `http://localhost:3001`.

**Page is blank / only the logo shows**
Make sure you are visiting `http://localhost:3000` in your browser — not opening the `index.html` file directly from your file system. The URL must start with `http://`, not `file://`.
