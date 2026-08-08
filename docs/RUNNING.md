# 🚀 SmartCashflow — User & Operations Guide

> **SmartCashflow** is a sector-based expense and multi-account income tracking application built with a client-side IndexedDB cache, dynamic visual charts, and a high-performance Python REST API gateway supporting both **MySQL 8.0+** and a zero-dependency **SQLite** local engine.

---

## 📋 Table of Contents
1. [Prerequisites](#-prerequisites)
2. [Quick Start (One-Click)](#-quick-start-one-click)
3. [Running with Python](#-running-with-python)
4. [Backend Database Modes](#-backend-database-modes)
   - [Mode A: MySQL Database (Recommended)](#mode-a-mysql-database-recommended)
   - [Mode B: SQLite Local Database (Standalone)](#mode-b-sqlite-local-database-standalone)
5. [Application Architecture & Port Mapping](#-application-architecture--port-mapping)
6. [Configuration Files](#-configuration-files)
7. [Default Admin Credentials](#-default-admin-credentials)
8. [Data Backup & Restore](#-data-backup--restore)
9. [Troubleshooting & FAQs](#-troubleshooting--faqs)

---

## 🔧 Prerequisites

- **Python**: Python `3.8` or higher
- **Web Browser**: Chrome, Edge, Firefox, Safari, or Brave (modern ES6+ & IndexedDB support)
- **Optional (for MySQL Mode)**:
  - MySQL Server running on `127.0.0.1:3306`
  - `pymysql` Python module (`pip install pymysql`)

---

## ⚡ Quick Start (One-Click)

### 🔹 macOS / Linux
Open your terminal in the project root directory and run:
```bash
./run_app.sh
```
*This shell script automatically detects your database, cleans up stale port locks, starts both the backend API and frontend servers, and opens your default browser.*

### 🔹 Windows / Cross-Platform
```bash
python run.py
```
*Or on Windows PowerShell / Command Prompt:*
```powershell
python.exe run.py
```

---

## 🐍 Running with Python

You can also run individual services manually:

### 1. Launch the Backend REST Gateway (Port 8081)
#### With MySQL:
```bash
python3 server/mysql_server.py
```
#### With SQLite (Zero Dependencies):
```bash
python3 server/sql_server.py
```

### 2. Launch the Frontend Static Web Server (Port 8000)
```bash
python3 -m http.server 8000
```
Then open your browser and navigate to **[http://localhost:8000](http://localhost:8000)**.

---

## 💾 Backend Database Modes

### Mode A: MySQL Database (Recommended)
- **Script**: `server/mysql_server.py`
- **Config**: `mysql_config.json` and `config.toml`
- **Port**: `8081` (REST API)
- **Default Database Name**: `smartcashflow_db`
- **Features**:
  - Full Multi-Tenant authentication and role scoping (`admin` vs `user`)
  - PBKDF2-HMAC-SHA256 password hashing (100,000 rounds)
  - Google OAuth Sign-in integration
  - Password reset workflows with 6-digit verification codes
  - Admin user management modal to promote/demote users and reset passwords
  - Automatic synchronization with `SmartCashflow_Backup.json`

### Mode B: SQLite Local Database (Standalone)
- **Script**: `server/sql_server.py`
- **Database File**: `smartcashflow.db`
- **Features**:
  - Zero external setup required (uses built-in Python `sqlite3`)
  - ACID-compliant WAL (Write-Ahead Logging) mode
  - Auto-seeding from `SmartCashflow_Backup.json` on initial launch

---

## 🌐 Application Architecture & Port Mapping

| Service | Port | Protocol | Purpose |
| :--- | :---: | :---: | :--- |
| **Web Frontend UI** | `8000` | HTTP | Serves HTML, CSS, JavaScript, icons, and client app |
| **REST API Gateway** | `8081` | HTTP / JSON | Handles Auth, Expenses, Accounts, Settings & Sync |
| **MySQL Server** | `3306` | MySQL TCP | Primary database store for multi-user instances |

```
┌────────────────────────────────────────────────────────┐
│               Web Browser (Client-Side)                │
│   • HTML5 / CSS3 (Indigo Glassmorphic Theme)           │
│   • Dexie.js (IndexedDB Local Offline Store)           │
│   • Chart.js (Dynamic Category & Trend Analytics)      │
└───────────▲───────────────────────────────▲────────────┘
            │ Port 8000                     │ Port 8081
            │ (Static Assets)               │ (REST API & Sync)
┌───────────▼───────────┐       ┌───────────▼────────────┐
│  Python HTTP Server   │       │  Python REST Gateway   │
│  (http.server 8000)   │       │  (server/mysql_server) │
└───────────────────────┘       └───────────▲────────────┘
                                            │ Port 3306
                                ┌───────────▼────────────┐
                                │      MySQL Server      │
                                │   (smartcashflow_db)   │
                                └────────────────────────┘
```

---

## ⚙️ Configuration Files

### 1. `config.toml`
Centralized application settings file specifying ports, auto-launch behavior, and default database engines.

### 2. `mysql_config.json`
Direct connection configuration for MySQL:
```json
{
  "host": "127.0.0.1",
  "port": 3306,
  "user": "root",
  "password": "",
  "database": "smartcashflow_db"
}
```

### 3. `pyproject.toml`
Standard Python packaging metadata, scripts, and build specifications.

---

## 👑 Default Admin Credentials

When the database is initialized, the default administrator account is automatically provisioned:

- **Username / Identifier**: `admin` or `sakthiumamaheswarit@gmail.com`
- **Password**: `admin`
- **Role**: `admin` (Access to Registered Users Directory & Global Management)

---

## 📦 Data Backup & Restore

- **Automated Backup**: Every add, edit, or delete action automatically triggers a background sync to `SmartCashflow_Backup.json`.
- **Manual Export**: Click the **Backup / Export JSON** button inside the web app or fetch via `http://localhost:8081/api/export`.
- **Manual Restore**: In the app settings panel, select **Import Backup JSON** to restore all records instantly.

---

## ❓ Troubleshooting & FAQs

### 1. "Port 8000 or 8081 is already in use"
Run the cleanup script to terminate any stale processes:
```bash
./run_app.sh
```
Or manually terminate via:
```bash
lsof -ti:8000 | xargs kill -9
lsof -ti:8081 | xargs kill -9
```

### 2. "pymysql module required"
Install `pymysql` via pip:
```bash
pip install pymysql
```
*If you do not have MySQL installed, SmartCashflow automatically falls back to the built-in SQLite engine.*

### 3. "Database Connection Refused"
- Check that MySQL is running on `127.0.0.1:3306`:
  ```bash
  mysqladmin -u root -p status
  ```
- Or run SQLite mode directly:
  ```bash
  python3 server/sql_server.py
  ```
