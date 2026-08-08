# 🔌 SmartCashflow — REST API Reference

> The SmartCashflow REST API operates on **Port 8081** by default with complete CORS support (`*`) and JSON payloads.

---

## 📡 Endpoint Summary

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/api/status` | Health check, record counts, active database info | No |
| `GET` | `/api/config` | MySQL host, port, user and database configuration | No |
| `GET` | `/api/sync` | Full data dump for sync (`expenses`, `accounts`, `settings`, `users`) | Optional (`?user_id=`) |
| `GET` | `/api/auth/users` | List all registered users with record counts | Admin |
| `GET` | `/api/export` | Download `SmartCashflow_Backup.json` as attachment | No |
| `POST` | `/api/auth/register` | Register a new user with PBKDF2 password | No |
| `POST` | `/api/auth/login` | Login with username/email and password | No |
| `POST` | `/api/auth/forgot-password` | Generate 6-digit password recovery code | No |
| `POST` | `/api/auth/reset-password` | Reset password using verified code | No |
| `POST` | `/api/auth/google` | Authenticate via Google OAuth credential token | No |
| `POST` | `/api/expenses` | Create or update an expense record | Yes |
| `POST` | `/api/accounts` | Create or update a bank/wallet account | Yes |
| `POST` | `/api/sync` | Bulk sync client data to MySQL/SQLite | Yes |
| `POST` | `/api/users/update-role` | Change a user's role (`admin` or `user`) | Admin |
| `POST` | `/api/users/admin-reset-password` | Direct administrative password reset | Admin |
| `POST` | `/api/users/delete` | Delete user and cascade their records | Admin |
| `DELETE`| `/api/expenses/:id` | Delete an expense by ID | Yes |
| `DELETE`| `/api/accounts/:id` | Delete an account by ID | Yes |

---

## 📖 Endpoint Details

### 1. System Health Check
`GET /api/status`

#### Response:
```json
{
  "status": "online",
  "database": "smartcashflow_db",
  "engine": "MySQL Server (127.0.0.1:3306)",
  "host": "127.0.0.1",
  "port": 3306,
  "user": "root",
  "expensesCount": 30,
  "accountsCount": 5,
  "usersCount": 5
}
```

---

### 2. User Registration
`POST /api/auth/register`

#### Request Body:
```json
{
  "username": "alex",
  "email": "alex@example.com",
  "password": "SecurePassword123!",
  "name": "Alex Mercer"
}
```

#### Response:
```json
{
  "status": "success",
  "user": {
    "id": "usr_1720000000000",
    "username": "alex",
    "email": "alex@example.com",
    "name": "Alex Mercer",
    "role": "user",
    "avatar_url": "",
    "auth_provider": "local"
  },
  "message": "Account created successfully!"
}
```

---

### 3. User Login
`POST /api/auth/login`

#### Request Body:
```json
{
  "identifier": "alex@example.com",
  "password": "SecurePassword123!"
}
```

#### Response:
```json
{
  "status": "success",
  "user": {
    "id": "usr_1720000000000",
    "username": "alex",
    "email": "alex@example.com",
    "name": "Alex Mercer",
    "role": "user",
    "avatar_url": "",
    "auth_provider": "local"
  },
  "message": "Welcome back, Alex Mercer!"
}
```

---

### 4. Create / Update Expense
`POST /api/expenses`

#### Request Body:
```json
{
  "id": "exp_1720000001",
  "userId": "usr_1720000000000",
  "accountId": "acc_primary",
  "title": "AWS Cloud Hosting",
  "amount": 142.50,
  "currency": "USD",
  "type": "Expense",
  "sector": "Cloud & Infrastructure",
  "paymentMethod": "Credit Card",
  "date": "2026-08-08",
  "recurring": "Monthly",
  "status": "Completed",
  "notes": "Production server hosting"
}
```

#### Response:
```json
{
  "status": "success",
  "id": "exp_1720000001"
}
```
