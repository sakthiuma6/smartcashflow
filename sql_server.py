#!/usr/bin/env python3
"""
SmartCashflow Local SQL Database REST Server
Powered by Python SQLite Engine - ACID Compliant Local SQL Storage with Multi-Tenant Auth & Admin Credentials
"""

import json
import sqlite3
from http.server import HTTPServer, BaseHTTPRequestHandler
import os
import hashlib
import secrets
import time

DB_FILE = 'smartcashflow.db'
PORT = 8081

def hash_password(password, salt=None):
    """Secure PBKDF2-HMAC-SHA256 password hashing with 100,000 iterations"""
    if not salt:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    )
    return f"{salt}${key.hex()}"

def verify_password(password, stored_hash):
    """Verifies plaintext password against PBKDF2 stored hash"""
    if not stored_hash or '$' not in stored_hash:
        return False
    salt, stored_key = stored_hash.split('$', 1)
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    )
    return secrets.compare_digest(key.hex(), stored_key)

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # Create SQL Tables
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS expenses (
            id TEXT PRIMARY KEY,
            user_id TEXT DEFAULT 'usr_admin',
            accountId TEXT,
            title TEXT,
            amount REAL,
            currency TEXT,
            type TEXT,
            sector TEXT,
            paymentMethod TEXT,
            date TEXT,
            recurring TEXT,
            status TEXT,
            notes TEXT
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            user_id TEXT DEFAULT 'usr_admin',
            name TEXT,
            bank TEXT,
            type TEXT,
            currency TEXT,
            initialBalance REAL
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT,
            name TEXT,
            avatar_url TEXT,
            auth_provider TEXT DEFAULT 'local',
            role TEXT DEFAULT 'user',
            google_id TEXT,
            reset_token TEXT,
            reset_token_expiry INTEGER,
            created_at TEXT
        )
    ''')

    # Ensure admin user exists or reset password to 'admin'
    cursor.execute("SELECT id FROM users WHERE username = 'admin' OR email = 'sakthiumamaheswarit@gmail.com'")
    existing_admin = cursor.fetchone()
    admin_hash = hash_password('admin')
    created_at = time.strftime('%Y-%m-%dT%H:%M:%SZ')

    if not existing_admin:
        cursor.execute('''
            INSERT INTO users (id, username, email, password_hash, name, avatar_url, auth_provider, role, created_at)
            VALUES ('usr_admin', 'admin', 'sakthiumamaheswarit@gmail.com', ?, 'Sakthi Umamaheswari (Admin)', '', 'local', 'admin', ?)
        ''', (admin_hash, created_at))
        print("👑 Default Admin User ('admin' / password: 'admin') created successfully!")
    else:
        cursor.execute('''
            UPDATE users 
            SET username = 'admin', email = 'sakthiumamaheswarit@gmail.com', password_hash = ?, name = 'Sakthi Umamaheswari (Admin)', role = 'admin'
            WHERE id = ? OR username = 'admin' OR email = 'sakthiumamaheswarit@gmail.com'
        ''', (admin_hash, existing_admin[0]))
        print("👑 Admin User updated with credentials ('admin' / password: 'admin')")

    conn.commit()
    conn.close()
    print(f"✅ Local SQL Database initialized: {os.path.abspath(DB_FILE)}")

class SQLRequestHandler(BaseHTTPRequestHandler):

    def _set_cors_headers(self, status=200):
        self.send_response(status)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_cors_headers(204)

    def do_GET(self):
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        if self.path == '/api/status':
            self._set_cors_headers(200)
            cursor.execute('SELECT COUNT(*) as count FROM expenses')
            expense_count = cursor.fetchone()['count']
            cursor.execute('SELECT COUNT(*) as count FROM accounts')
            account_count = cursor.fetchone()['count']
            
            res = {
                'status': 'online',
                'database': 'smartcashflow.db',
                'engine': 'SQLite SQL Engine',
                'expensesCount': expense_count,
                'accountsCount': account_count
            }
            self.wfile.write(json.dumps(res).encode('utf-8'))

        elif self.path == '/api/sync':
            self._set_cors_headers(200)
            cursor.execute('SELECT * FROM expenses')
            expenses = [dict(row) for row in cursor.fetchall()]

            cursor.execute('SELECT * FROM accounts')
            accounts = [dict(row) for row in cursor.fetchall()]

            cursor.execute('SELECT * FROM settings')
            settings_rows = cursor.fetchall()
            settings = {row['key']: json.loads(row['value']) for row in settings_rows}

            cursor.execute('SELECT id, username, email, name, role, auth_provider FROM users')
            users = [dict(row) for row in cursor.fetchall()]

            res = {
                'expenses': expenses,
                'accounts': accounts,
                'settings': settings,
                'users': users
            }
            self.wfile.write(json.dumps(res, indent=2).encode('utf-8'))

        elif self.path == '/api/auth/users':
            self._set_cors_headers(200)
            cursor.execute('''
                SELECT u.id, u.username, u.email, u.name, u.role, u.avatar_url, u.auth_provider, u.created_at,
                       (SELECT COUNT(*) FROM expenses e WHERE e.user_id = u.id) as expense_count,
                       (SELECT COUNT(*) FROM accounts a WHERE a.user_id = u.id) as account_count
                FROM users u
                ORDER BY u.created_at DESC
            ''')
            users = [dict(row) for row in cursor.fetchall()]
            self.wfile.write(json.dumps({'users': users}).encode('utf-8'))

        else:
            self._set_cors_headers(404)
            self.wfile.write(json.dumps({'error': 'Not Found'}).encode('utf-8'))

        conn.close()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body_bytes = self.rfile.read(content_length)
        payload = json.loads(body_bytes.decode('utf-8')) if body_bytes else {}

        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # 1. AUTH: User Registration
        if self.path == '/api/auth/register':
            username = payload.get('username', '').strip()
            email = payload.get('email', '').strip().lower()
            password = payload.get('password', '')
            name = payload.get('name', '').strip() or username

            if not username or not email or not password:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Username, email and password are required'}).encode('utf-8'))
                conn.close()
                return

            cursor.execute('SELECT id FROM users WHERE email = ? OR username = ?', (email, username))
            if cursor.fetchone():
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Username or Email is already registered'}).encode('utf-8'))
                conn.close()
                return

            user_id = f"usr_{int(time.time()*1000)}"
            pwd_hash = hash_password(password)
            created_at = time.strftime('%Y-%m-%dT%H:%M:%SZ')
            role = 'admin' if username.lower() == 'admin' or email == 'sakthiumamaheswarit@gmail.com' else 'user'

            cursor.execute('''
                INSERT INTO users (id, username, email, password_hash, name, avatar_url, auth_provider, role, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (user_id, username, email, pwd_hash, name, '', 'local', role, created_at))
            conn.commit()

            user_obj = {
                'id': user_id,
                'username': username,
                'email': email,
                'name': name,
                'role': role,
                'avatar_url': '',
                'auth_provider': 'local'
            }
            self._set_cors_headers(200)
            self.wfile.write(json.dumps({'status': 'success', 'user': user_obj, 'message': 'Account created successfully!'}).encode('utf-8'))
            conn.close()
            return

        # 2. AUTH: User Login (Username or Email)
        elif self.path == '/api/auth/login':
            identifier = payload.get('identifier', '').strip()
            password = payload.get('password', '')

            if not identifier or not password:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Username/Email and Password required'}).encode('utf-8'))
                conn.close()
                return

            cursor.execute('SELECT * FROM users WHERE email = ? OR username = ?', (identifier.lower(), identifier))
            user = cursor.fetchone()

            if not user or not verify_password(password, user['password_hash']):
                self._set_cors_headers(401)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Invalid username/email or password'}).encode('utf-8'))
                conn.close()
                return

            user_obj = {
                'id': user['id'],
                'username': user['username'],
                'email': user['email'],
                'name': user['name'],
                'role': user['role'] if user['role'] else 'user',
                'avatar_url': user['avatar_url'] if user['avatar_url'] else '',
                'auth_provider': user['auth_provider'] if user['auth_provider'] else 'local'
            }
            self._set_cors_headers(200)
            self.wfile.write(json.dumps({'status': 'success', 'user': user_obj, 'message': f"Welcome back, {user['name']}!"}).encode('utf-8'))
            conn.close()
            return

        # 3. AUTH: Forgot Password Code
        elif self.path == '/api/auth/forgot-password':
            email = payload.get('email', '').strip().lower()
            if not email:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Email is required'}).encode('utf-8'))
                conn.close()
                return

            cursor.execute('SELECT id, name FROM users WHERE email = ?', (email,))
            user = cursor.fetchone()

            reset_code = str(secrets.randbelow(900000) + 100000)
            expiry = int(time.time()) + 900

            if user:
                cursor.execute('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?', (reset_code, expiry, email))
                conn.commit()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                'status': 'success',
                'message': f"Password reset verification code generated for {email}.",
                'resetCode': reset_code
            }).encode('utf-8'))
            conn.close()
            return

        # 4. AUTH: Reset Password
        elif self.path == '/api/auth/reset-password':
            email = payload.get('email', '').strip().lower()
            reset_code = payload.get('resetToken', '').strip()
            new_password = payload.get('newPassword', '')

            if not email or not reset_code or not new_password:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Email, reset code and new password required'}).encode('utf-8'))
                conn.close()
                return

            cursor.execute('SELECT * FROM users WHERE email = ? AND reset_token = ?', (email, reset_code))
            user = cursor.fetchone()

            now_ts = int(time.time())
            if not user or not user['reset_token_expiry'] or user['reset_token_expiry'] < now_ts:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Invalid or expired password reset verification code'}).encode('utf-8'))
                conn.close()
                return

            new_hash = hash_password(new_password)
            cursor.execute('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE email = ?', (new_hash, email))
            conn.commit()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({'status': 'success', 'message': 'Password has been reset successfully!'}).encode('utf-8'))
            conn.close()
            return

        # 5. AUTH: Google / Gmail OAuth Sign-In
        elif self.path == '/api/auth/google':
            google_id = payload.get('googleId', '').strip()
            email = payload.get('email', '').strip().lower()
            name = payload.get('name', '').strip()
            avatar_url = payload.get('avatarUrl', '').strip()

            if not email:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Google email required'}).encode('utf-8'))
                conn.close()
                return

            cursor.execute('SELECT * FROM users WHERE google_id = ? OR email = ?', (google_id, email))
            user = cursor.fetchone()

            if user:
                cursor.execute('UPDATE users SET google_id = ?, avatar_url = ?, name = ? WHERE id = ?', (google_id or user['google_id'], avatar_url or user['avatar_url'], name or user['name'], user['id']))
                conn.commit()
                user_id = user['id']
                username = user['username']
                role = user['role'] if user['role'] else 'user'
            else:
                user_id = f"usr_{int(time.time()*1000)}"
                username = email.split('@')[0]
                created_at = time.strftime('%Y-%m-%dT%H:%M:%SZ')
                role = 'admin' if email == 'sakthiumamaheswarit@gmail.com' else 'user'
                cursor.execute('''
                    INSERT INTO users (id, username, email, password_hash, name, avatar_url, auth_provider, role, google_id, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (user_id, username, email, '', name, avatar_url, 'google', role, google_id, created_at))
                conn.commit()

            user_obj = {
                'id': user_id,
                'username': username,
                'email': email,
                'name': name,
                'role': role,
                'avatar_url': avatar_url,
                'auth_provider': 'google'
            }
            self._set_cors_headers(200)
            self.wfile.write(json.dumps({'status': 'success', 'user': user_obj, 'message': f"Signed in as {name} via Google!"}).encode('utf-8'))
            conn.close()
            return

        # 6. ADMIN USER MANAGEMENT: Update Role
        elif self.path == '/api/users/update-role':
            user_id = payload.get('userId')
            new_role = payload.get('role', 'user')
            cursor.execute('UPDATE users SET role = ? WHERE id = ?', (new_role, user_id))
            conn.commit()
            self._set_cors_headers(200)
            self.wfile.write(json.dumps({'status': 'success', 'message': f'User role updated to {new_role}'}).encode('utf-8'))
            conn.close()
            return

        # 7. ADMIN USER MANAGEMENT: Reset Password
        elif self.path == '/api/users/admin-reset-password':
            user_id = payload.get('userId')
            new_pass = payload.get('newPassword')
            pwd_hash = hash_password(new_pass)
            cursor.execute('UPDATE users SET password_hash = ? WHERE id = ?', (pwd_hash, user_id))
            conn.commit()
            self._set_cors_headers(200)
            self.wfile.write(json.dumps({'status': 'success', 'message': 'User password reset successfully'}).encode('utf-8'))
            conn.close()
            return

        # 8. ADMIN USER MANAGEMENT: Delete User & Purge Records
        elif self.path == '/api/users/delete':
            user_id = payload.get('userId')
            if user_id == 'usr_admin':
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Cannot delete primary Admin account'}).encode('utf-8'))
                conn.close()
                return

            cursor.execute('DELETE FROM expenses WHERE user_id = ?', (user_id,))
            cursor.execute('DELETE FROM accounts WHERE user_id = ?', (user_id,))
            cursor.execute('DELETE FROM users WHERE id = ?', (user_id,))
            conn.commit()
            self._set_cors_headers(200)
            self.wfile.write(json.dumps({'status': 'success', 'message': 'User account and all linked records deleted'}).encode('utf-8'))
            conn.close()
            return

        elif self.path == '/api/sync':
            # Bulk Sync: Replace/Upsert all records from client
            if 'expenses' in payload and isinstance(payload['expenses'], list):
                cursor.execute('DELETE FROM expenses')
                for item in payload['expenses']:
                    cursor.execute('''
                        INSERT OR REPLACE INTO expenses 
                        (id, user_id, accountId, title, amount, currency, type, sector, paymentMethod, date, recurring, status, notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        str(item.get('id', '')),
                        str(item.get('userId', item.get('user_id', 'usr_admin'))),
                        str(item.get('accountId', 'acc_primary')),
                        str(item.get('title', '')),
                        float(item.get('amount', 0)),
                        str(item.get('currency', 'USD')),
                        str(item.get('type', 'Expense')),
                        str(item.get('sector', 'Others')),
                        str(item.get('paymentMethod', 'Bank Transfer')),
                        str(item.get('date', '')),
                        str(item.get('recurring', 'One-time')),
                        str(item.get('status', 'Completed')),
                        str(item.get('notes', ''))
                    ))

            if 'accounts' in payload and isinstance(payload['accounts'], list):
                cursor.execute('DELETE FROM accounts')
                for acc in payload['accounts']:
                    cursor.execute('''
                        INSERT OR REPLACE INTO accounts
                        (id, user_id, name, bank, type, currency, initialBalance)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        str(acc.get('id', '')),
                        str(acc.get('userId', acc.get('user_id', 'usr_admin'))),
                        str(acc.get('name', '')),
                        str(acc.get('bank', '')),
                        str(acc.get('type', 'Checking')),
                        str(acc.get('currency', 'USD')),
                        float(acc.get('initialBalance', 0))
                    ))

            if 'settings' in payload and isinstance(payload['settings'], dict):
                for k, v in payload['settings'].items():
                    cursor.execute('''
                        INSERT OR REPLACE INTO settings (key, value)
                        VALUES (?, ?)
                    ''', (k, json.dumps(v)))

            conn.commit()
            self._set_cors_headers(200)
            self.wfile.write(json.dumps({'status': 'success', 'message': 'Full SQL database synced'}).encode('utf-8'))

        elif self.path == '/api/expenses':
            item = payload
            cursor.execute('''
                INSERT OR REPLACE INTO expenses 
                (id, user_id, accountId, title, amount, currency, type, sector, paymentMethod, date, recurring, status, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                str(item.get('id', '')),
                str(item.get('userId', item.get('user_id', 'usr_admin'))),
                str(item.get('accountId', 'acc_primary')),
                str(item.get('title', '')),
                float(item.get('amount', 0)),
                str(item.get('currency', 'USD')),
                str(item.get('type', 'Expense')),
                str(item.get('sector', 'Others')),
                str(item.get('paymentMethod', 'Bank Transfer')),
                str(item.get('date', '')),
                str(item.get('recurring', 'One-time')),
                str(item.get('status', 'Completed')),
                str(item.get('notes', ''))
            ))
            conn.commit()
            self._set_cors_headers(200)
            self.wfile.write(json.dumps({'status': 'success', 'id': item.get('id')}).encode('utf-8'))

        elif self.path == '/api/accounts':
            acc = payload
            cursor.execute('''
                INSERT OR REPLACE INTO accounts
                (id, user_id, name, bank, type, currency, initialBalance)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                str(acc.get('id', '')),
                str(acc.get('userId', acc.get('user_id', 'usr_admin'))),
                str(acc.get('name', '')),
                str(acc.get('bank', '')),
                str(acc.get('type', 'Checking')),
                str(acc.get('currency', 'USD')),
                float(acc.get('initialBalance', 0))
            ))
            conn.commit()
            self._set_cors_headers(200)
            self.wfile.write(json.dumps({'status': 'success', 'id': acc.get('id')}).encode('utf-8'))

        else:
            self._set_cors_headers(404)
            self.wfile.write(json.dumps({'error': 'Not Found'}).encode('utf-8'))

        conn.close()

    def do_DELETE(self):
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()

        if self.path.startswith('/api/expenses/'):
            expense_id = self.path.replace('/api/expenses/', '').strip()
            cursor.execute('DELETE FROM expenses WHERE id = ?', (expense_id,))
            conn.commit()
            self._set_cors_headers(200)
            self.wfile.write(json.dumps({'status': 'deleted', 'id': expense_id}).encode('utf-8'))
        elif self.path.startswith('/api/accounts/'):
            account_id = self.path.replace('/api/accounts/', '').strip()
            cursor.execute('DELETE FROM accounts WHERE id = ?', (account_id,))
            conn.commit()
            self._set_cors_headers(200)
            self.wfile.write(json.dumps({'status': 'deleted', 'id': account_id}).encode('utf-8'))
        else:
            self._set_cors_headers(404)
            self.wfile.write(json.dumps({'error': 'Not Found'}).encode('utf-8'))

        conn.close()

def run():
    init_db()
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, SQLRequestHandler)
    print(f"🚀 SmartCashflow Local SQL Server running at http://localhost:{PORT}")
    httpd.serve_forever()

if __name__ == '__main__':
    run()
