# 🏗️ SmartCashflow — Technical Architecture & Internal Design

> A comprehensive deep-dive into the architectural patterns, data pipelines, multi-tenant authentication system, cryptography, and storage synchronization mechanisms powering SmartCashflow.

---

## 🏛️ System Architecture Overview

SmartCashflow is engineered with a **hybrid local-first architecture**:
1. **Client-Side Tier (Fast & Offline-Ready)**: Uses HTML5, CSS3, ES6 JavaScript modules, Dexie.js (IndexedDB), and Chart.js to provide zero-latency interaction and instant search/filtering.
2. **REST API Gateway (Python Tier)**: Non-blocking HTTP REST server handling authentication, multi-tenant session verification, and database interactions.
3. **Primary Database Storage Tier (MySQL & SQLite)**: Persistent ACID-compliant storage with multi-account balances, expense ledgers, user profiles, and encrypted passwords.
4. **Resilient JSON Backup Mirror**: Continuous asynchronous snapshots to `SmartCashflow_Backup.json`.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FRONTEND LAYER (PORT 8000)                       │
│                                                                             │
│  ┌─────────────────────────┐  ┌───────────────────────┐  ┌────────────────┐ │
│  │   Landing Page & Auth   │  │ Sector Analytics Hub  │  │ Multi-Account  │ │
│  │  (Modal & Glassmorphic) │  │  (Chart.js Bar/Pie)   │  │ Ledger & Cards │ │
│  └────────────┬────────────┘  └───────────┬───────────┘  └────────┬───────┘ │
│               │                           │                       │         │
│               └───────────────────────────┼───────────────────────┘         │
│                                           │                                 │
│                               ┌───────────▼───────────┐                     │
│                               │   Dexie.js (IndexedDB)│ (Offline Store)     │
│                               └───────────┬───────────┘                     │
└───────────────────────────────────────────┼─────────────────────────────────┘
                                            │ HTTP / JSON Sync
                                            │ (Port 8081)
┌───────────────────────────────────────────▼─────────────────────────────────┐
│                        BACKEND API LAYER (PORT 8081)                        │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │               server/mysql_server.py  /  server/sql_server.py         │  │
│  │                                                                       │  │
│  │  • Multi-Tenant Request Router       • PBKDF2 Password Verifier       │  │
│  │  • Session Scope / Admin Guard       • Static File Proxy (Fallback)   │  │
│  └──────────────────┬─────────────────────────────────┬──────────────────┘  │
└─────────────────────┼─────────────────────────────────┼─────────────────────┘
                      │                                 │
         ┌────────────▼────────────┐       ┌────────────▼────────────┐
         │       MySQL 8.0+        │       │      SQLite 3 (WAL)     │
         │  (smartcashflow_db)     │       │   (smartcashflow.db)    │
         └────────────┬────────────┘       └────────────┬────────────┘
                      │                                 │
                      └────────────────┬────────────────┘
                                       │ Snapshot Sync
                          ┌────────────▼────────────┐
                          │SmartCashflow_Backup.json│
                          └─────────────────────────┘
```

---

## 📂 Project Directory Structure

```
expense_tracker/
├── assets/                  # Brand assets, logo, favicons
│   └── logo.png
├── config/                  # Configuration files
│   ├── config.toml          # Primary TOML configuration
│   └── mysql_config.json    # MySQL connection configuration
├── css/                     # Glassmorphic UI styling
│   └── styles.css
├── docs/                    # Complete Project Documentation
│   ├── RUNNING.md           # User & Operations Manual
│   ├── ARCHITECTURE.md      # Technical Architecture & Design
│   └── API_REFERENCE.md     # REST API Specification
├── js/                      # Frontend Logic & Controllers
│   ├── app.js               # Main Application Controller & DOM Binder
│   ├── auth.js              # Authentication, Sessions & Google OAuth
│   ├── charts.js            # Chart.js Visualizations & Analytics
│   ├── currency.js          # Multi-Currency Formatter & Rates
│   ├── db.js                # IndexedDB (Dexie.js) Data Access Layer
│   └── sync.js              # Dual-Sync Pipeline (Client <-> Backend)
├── server/                  # Python Backend Servers
│   ├── __init__.py          # Server Package Definition
│   ├── mysql_server.py      # Primary MySQL REST API Gateway
│   └── sql_server.py        # Standalone SQLite REST Server
├── index.html               # Main Single-Page Application (SPA)
├── pyproject.toml           # Python Packaging & Dependencies
├── README.md                # Project Root Quickstart
├── run.py                   # Cross-Platform Python Launcher
├── run_app.sh               # One-Click Shell Startup Script
├── smartcashflow.db         # SQLite Local Database File
└── SmartCashflow_Backup.json# Real-Time Automatic JSON Backup Mirror
```

---

## 🔒 Security & Cryptography

### 1. PBKDF2 Password Hashing
Passwords are never stored in plaintext. SmartCashflow uses **PBKDF2-HMAC-SHA256** with:
- **Salt**: 16 bytes of cryptographically secure randomness generated via `secrets.token_hex(16)`.
- **Iterations**: `100,000` computational rounds.
- **Format**: `<hex_salt>$<hex_key>`.
- **Constant-Time Verification**: `secrets.compare_digest` to prevent timing attacks.

### 2. Multi-Tenant Role Isolation
Each database record (`expenses` and `accounts`) contains a `user_id` column:
- Regular users can only read, update, or delete records belonging to their own `user_id`.
- Administrators (`role = 'admin'`) can access system status, registered users directories, password reset tooling, and aggregate analytics.

---

## 🔄 Two-Way Synchronization Pipeline

1. **Optimistic Local Mutation**: User creates or edits an expense → UI immediately updates and writes to IndexedDB.
2. **Backend Push**: `sync.js` sends an HTTP `POST` to `/api/expenses` or `/api/accounts`.
3. **Database Write**: The backend issues an `INSERT ... ON DUPLICATE KEY UPDATE` to MySQL / SQLite.
4. **JSON Snapshot**: A background task serializes all active records to `SmartCashflow_Backup.json`.
5. **Periodic Pull**: If another browser tab or session makes changes, client periodically queries `/api/sync?user_id=...` and merges updates into IndexedDB.
