#!/usr/bin/env python3
"""
SmartCashflow Local MySQL Server Connector & REST API Gateway
Supports Multi-Tenant User Data Scoping, Admin Account ('sakthiumamaheswarit@gmail.com'),
PBKDF2 Password Hashing, Password Reset, and Google OAuth Sign-In
"""

json = __import__('json')
from http.server import HTTPServer, BaseHTTPRequestHandler
import sys
import time
import os
import hashlib
import secrets

try:
    import pymysql
except ImportError:
    print("pymysql module required. Install with: pip install pymysql")
    sys.exit(1)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR) if os.path.basename(BASE_DIR) == 'server' else BASE_DIR
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')

def resolve_path(filename):
    for dir_path in [DATA_DIR, PROJECT_ROOT, BASE_DIR]:
        target = os.path.join(dir_path, filename)
        if os.path.exists(target):
            return target
    if os.path.exists(DATA_DIR):
        return os.path.join(DATA_DIR, filename)
    return os.path.join(PROJECT_ROOT, filename)

CONFIG_FILE = resolve_path('mysql_config.json')
BACKUP_FILE = resolve_path('SmartCashflow_Backup.json')
API_PORT = 8081

# Default Connection Fallback
mysql_config = {
    'host': '127.0.0.1',
    'port': 3306,
    'user': 'root',
    'password': '',
    'database': 'smartcashflow_db'
}

def load_config():
    global mysql_config
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                loaded = json.load(f)
                mysql_config.update(loaded)
                print(f"📖 Loaded MySQL config: Host={mysql_config['host']}:{mysql_config['port']} User={mysql_config['user']} DB={mysql_config['database']}")
        except Exception as e:
            print("⚠️ Error reading mysql_config.json:", e)

def save_config(new_cfg):
    global mysql_config
    mysql_config.update(new_cfg)
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(mysql_config, f, indent=2)
        print("💾 Updated mysql_config.json successfully")
    except Exception as e:
        print("⚠️ Error writing mysql_config.json:", e)

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

def get_db_connection(create_db=True, config_override=None):
    """Establishes connection to MySQL Server using active config"""
    cfg = config_override if config_override else mysql_config
    host = cfg.get('host', '127.0.0.1')
    port = int(cfg.get('port', 3306))
    user = cfg.get('user', 'root')
    password = cfg.get('password', '')
    db_name = cfg.get('database', 'smartcashflow_db')

    try:
        conn = pymysql.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            autocommit=True
        )
        if create_db:
            with conn.cursor() as cursor:
                cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
            conn.select_db(db_name)
        return conn
    except Exception as e:
        print(f"⚠️ MySQL Connection error ({host}:{port}): {e}")
        return None

def sync_backup_file():
    """Generates SmartCashflow_Backup.json in current directory"""
    conn = get_db_connection()
    if not conn: return
    try:
        cursor = conn.cursor(pymysql.cursors.DictCursor)
        cursor.execute('SELECT * FROM expenses')
        expenses_raw = cursor.fetchall()
        expenses = []
        for item in expenses_raw:
            item['amount'] = float(item['amount']) if item['amount'] is not None else 0.0
            expenses.append(item)

        cursor.execute('SELECT * FROM accounts')
        accounts_raw = cursor.fetchall()
        accounts = []
        for acc in accounts_raw:
            acc['initialBalance'] = float(acc['initialBalance']) if acc['initialBalance'] is not None else 0.0
            accounts.append(acc)

        cursor.execute('SELECT * FROM settings')
        settings_rows = cursor.fetchall()
        settings = {row['setting_key']: json.loads(row['setting_value']) for row in settings_rows}

        cursor.execute('SELECT id, username, email, name, role, auth_provider FROM users')
        users = cursor.fetchall()

        export_data = {
            'app': 'SmartCashflow',
            'version': '2.5.0',
            'exportDate': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'accounts': accounts,
            'expenses': expenses,
            'settings': settings,
            'users': users
        }

        with open(BACKUP_FILE, 'w') as f:
            json.dump(export_data, f, indent=2)
        conn.close()
    except Exception as err:
        print("⚠️ Error writing backup JSON:", err)

def init_mysql_schema():
    """Initializes tables in MySQL Server with User-ID Scoping & Admin Account"""
    conn = get_db_connection()
    if not conn:
        print("⚠️ MySQL server not reachable yet. Retrying...")
        return False

    try:
        with conn.cursor() as cursor:
            # Table: expenses (with user_id column)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS expenses (
                    id VARCHAR(100) PRIMARY KEY,
                    user_id VARCHAR(100) DEFAULT 'usr_admin',
                    accountId VARCHAR(100),
                    title VARCHAR(255),
                    amount DECIMAL(15,2),
                    currency VARCHAR(10),
                    type VARCHAR(20),
                    sector VARCHAR(100),
                    paymentMethod VARCHAR(100),
                    date VARCHAR(20),
                    recurring VARCHAR(50),
                    status VARCHAR(50),
                    notes TEXT
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ''')

            # Table: accounts (with user_id column)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS accounts (
                    id VARCHAR(100) PRIMARY KEY,
                    user_id VARCHAR(100) DEFAULT 'usr_admin',
                    name VARCHAR(255),
                    bank VARCHAR(255),
                    type VARCHAR(50),
                    currency VARCHAR(10),
                    initialBalance DECIMAL(15,2)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ''')

            # Table: settings
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS settings (
                    setting_key VARCHAR(100) PRIMARY KEY,
                    setting_value TEXT
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ''')

            # Table: users (with role column)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id VARCHAR(100) PRIMARY KEY,
                    username VARCHAR(100) UNIQUE,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255),
                    name VARCHAR(255),
                    avatar_url TEXT,
                    auth_provider VARCHAR(50) DEFAULT 'local',
                    role VARCHAR(50) DEFAULT 'user',
                    google_id VARCHAR(255),
                    reset_token VARCHAR(255),
                    reset_token_expiry BIGINT,
                    created_at VARCHAR(50)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ''')

            # Safely add user_id column if missing in older database tables
            try:
                cursor.execute("ALTER TABLE expenses ADD COLUMN user_id VARCHAR(100) DEFAULT 'usr_admin';")
            except Exception: pass
            try:
                cursor.execute("ALTER TABLE accounts ADD COLUMN user_id VARCHAR(100) DEFAULT 'usr_admin';")
            except Exception: pass
            try:
                cursor.execute("ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user';")
            except Exception: pass

            # Assign orphaned expenses/accounts without user_id to default admin
            cursor.execute("UPDATE expenses SET user_id = 'usr_admin' WHERE user_id IS NULL OR user_id = ''")
            cursor.execute("UPDATE accounts SET user_id = 'usr_admin' WHERE user_id IS NULL OR user_id = ''")

            # Create or Update Default Admin User ('admin' / 'sakthiumamaheswarit@gmail.com')
            cursor.execute("SELECT id FROM users WHERE username = 'admin' OR email = 'sakthiumamaheswarit@gmail.com' OR email = 'admin@smartcashflow.com'")
            existing_admin = cursor.fetchone()
            if not existing_admin:
                admin_hash = hash_password('admin')
                cursor.execute('''
                    INSERT INTO users (id, username, email, password_hash, name, avatar_url, auth_provider, role, created_at)
                    VALUES ('usr_admin', 'admin', 'sakthiumamaheswarit@gmail.com', %s, 'Sakthi Umamaheswari (Admin)', '', 'local', 'admin', %s)
                ''', (admin_hash, time.strftime('%Y-%m-%dT%H:%M:%SZ')))
                print("👑 Default Admin User ('admin' / 'sakthiumamaheswarit@gmail.com') created successfully!")
            else:
                cursor.execute('''
                    UPDATE users 
                    SET email = 'sakthiumamaheswarit@gmail.com', name = 'Sakthi Umamaheswari (Admin)', role = 'admin'
                    WHERE id = %s OR username = 'admin';
                ''', (existing_admin[0],))
                print("👑 Admin User updated with email: sakthiumamaheswarit@gmail.com")

        print(f"✅ MySQL Database '{mysql_config['database']}' & tables initialized successfully on {mysql_config['host']}:{mysql_config['port']}")
        conn.close()
        sync_backup_file()
        return True
    except Exception as err:
        print(f"⚠️ Error creating MySQL tables: {err}")
        if conn: conn.close()
        return False

class MySQLRequestHandler(BaseHTTPRequestHandler):

    def _set_cors_headers(self, status=200):
        self.send_response(status)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_cors_headers(204)

    def do_GET(self):
        # Static file serving for web UI
        if not self.path.startswith('/api/'):
            clean_path = self.path.split('?')[0].lstrip('/')
            if clean_path == '' or clean_path == 'index.html':
                file_path = os.path.join(PROJECT_ROOT, 'index.html')
            else:
                file_path = os.path.join(PROJECT_ROOT, clean_path)
            
            abs_file_path = os.path.abspath(file_path)
            if abs_file_path.startswith(PROJECT_ROOT) and os.path.exists(abs_file_path) and os.path.isfile(abs_file_path):
                ext = os.path.splitext(abs_file_path)[1].lower()
                mime_types = {
                    '.html': 'text/html; charset=utf-8',
                    '.css': 'text/css; charset=utf-8',
                    '.js': 'application/javascript; charset=utf-8',
                    '.json': 'application/json; charset=utf-8',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.svg': 'image/svg+xml',
                    '.ico': 'image/x-icon',
                    '.woff': 'font/woff',
                    '.woff2': 'font/woff2',
                    '.ttf': 'font/ttf'
                }
                content_type = mime_types.get(ext, 'application/octet-stream')
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(os.path.getsize(abs_file_path)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                with open(abs_file_path, 'rb') as f:
                    self.wfile.write(f.read())
                return

        if self.path == '/api/config':
            self._set_cors_headers(200)
            safe_cfg = {
                'host': mysql_config['host'],
                'port': mysql_config['port'],
                'user': mysql_config['user'],
                'database': mysql_config['database'],
                'hasPassword': bool(mysql_config['password'])
            }
            self.wfile.write(json.dumps(safe_cfg).encode('utf-8'))
            return

        conn = get_db_connection()
        if not conn:
            self._set_cors_headers(500)
            self.wfile.write(json.dumps({'error': f"Cannot connect to MySQL server at {mysql_config['host']}:{mysql_config['port']}"}).encode('utf-8'))
            return

        cursor = conn.cursor(pymysql.cursors.DictCursor)

        if self.path == '/api/status':
            self._set_cors_headers(200)
            cursor.execute('SELECT COUNT(*) as count FROM expenses')
            expense_count = cursor.fetchone()['count']
            cursor.execute('SELECT COUNT(*) as count FROM accounts')
            account_count = cursor.fetchone()['count']
            cursor.execute('SELECT COUNT(*) as count FROM users')
            user_count = cursor.fetchone()['count']
            
            res = {
                'status': 'online',
                'database': mysql_config['database'],
                'engine': f"MySQL Server ({mysql_config['host']}:{mysql_config['port']})",
                'host': mysql_config['host'],
                'port': mysql_config['port'],
                'user': mysql_config['user'],
                'expensesCount': expense_count,
                'accountsCount': account_count,
                'usersCount': user_count
            }
            self.wfile.write(json.dumps(res).encode('utf-8'))

        elif self.path == '/api/export':
            sync_backup_file()
            if os.path.exists(BACKUP_FILE):
                with open(BACKUP_FILE, 'rb') as f:
                    json_bytes = f.read()
            else:
                json_bytes = json.dumps({'expenses': [], 'accounts': []}).encode('utf-8')

            filename = f"SmartCashflow_Backup_{time.strftime('%Y-%m-%d')}.json"

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
            self.send_header('Content-Length', str(len(json_bytes)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json_bytes)

        elif self.path.startswith('/api/sync'):
            self._set_cors_headers(200)
            
            user_filter = None
            if '?' in self.path:
                query = self.path.split('?', 1)[1]
                params = dict(q.split('=') for q in query.split('&') if '=' in q)
                user_filter = params.get('user_id')

            if user_filter and user_filter != 'ALL':
                cursor.execute('SELECT * FROM expenses WHERE user_id = %s OR user_id IS NULL', (user_filter,))
                expenses_raw = cursor.fetchall()
                cursor.execute('SELECT * FROM accounts WHERE user_id = %s OR user_id IS NULL', (user_filter,))
                accounts_raw = cursor.fetchall()
            else:
                cursor.execute('SELECT * FROM expenses')
                expenses_raw = cursor.fetchall()
                cursor.execute('SELECT * FROM accounts')
                accounts_raw = cursor.fetchall()

            expenses = []
            for item in expenses_raw:
                item['amount'] = float(item['amount']) if item['amount'] is not None else 0.0
                expenses.append(item)

            accounts = []
            for acc in accounts_raw:
                acc['initialBalance'] = float(acc['initialBalance']) if acc['initialBalance'] is not None else 0.0
                accounts.append(acc)

            cursor.execute('SELECT * FROM settings')
            settings_rows = cursor.fetchall()
            settings = {row['setting_key']: json.loads(row['setting_value']) for row in settings_rows}

            res = {
                'expenses': expenses,
                'accounts': accounts,
                'settings': settings
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
            users = cursor.fetchall()
            self.wfile.write(json.dumps({'users': users}).encode('utf-8'))

        else:
            self._set_cors_headers(404)
            self.wfile.write(json.dumps({'error': 'Not Found'}).encode('utf-8'))

        conn.close()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body_bytes = self.rfile.read(content_length)
        payload = json.loads(body_bytes.decode('utf-8')) if body_bytes else {}

        # 1. AUTH: User Registration
        if self.path == '/api/auth/register':
            username = payload.get('username', '').strip()
            email = payload.get('email', '').strip().lower()
            password = payload.get('password', '')
            name = payload.get('name', '').strip() or username

            if not username or not email or not password:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Username, email and password are required'}).encode('utf-8'))
                return

            conn = get_db_connection()
            if not conn:
                self._set_cors_headers(500)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Database connection error'}).encode('utf-8'))
                return

            try:
                cursor = conn.cursor(pymysql.cursors.DictCursor)
                cursor.execute('SELECT id FROM users WHERE email = %s OR username = %s', (email, username))
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
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ''', (user_id, username, email, pwd_hash, name, '', 'local', role, created_at))

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
            except Exception as e:
                self._set_cors_headers(500)
                self.wfile.write(json.dumps({'status': 'error', 'message': f"Registration failed: {e}"}).encode('utf-8'))
            finally:
                conn.close()
            return

        # 2. AUTH: User Login (Username or Email)
        elif self.path == '/api/auth/login':
            identifier = payload.get('identifier', '').strip()
            password = payload.get('password', '')

            if not identifier or not password:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Username/Email and Password required'}).encode('utf-8'))
                return

            conn = get_db_connection()
            if not conn:
                self._set_cors_headers(500)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Database connection error'}).encode('utf-8'))
                return

            try:
                cursor = conn.cursor(pymysql.cursors.DictCursor)
                cursor.execute('SELECT * FROM users WHERE email = %s OR username = %s', (identifier.lower(), identifier))
                user = cursor.fetchone()

                if not user or not verify_password(password, user.get('password_hash')):
                    self._set_cors_headers(401)
                    self.wfile.write(json.dumps({'status': 'error', 'message': 'Invalid username/email or password'}).encode('utf-8'))
                    conn.close()
                    return

                user_obj = {
                    'id': user['id'],
                    'username': user['username'],
                    'email': user['email'],
                    'name': user['name'],
                    'role': user.get('role', 'user'),
                    'avatar_url': user.get('avatar_url', ''),
                    'auth_provider': user.get('auth_provider', 'local')
                }
                self._set_cors_headers(200)
                self.wfile.write(json.dumps({'status': 'success', 'user': user_obj, 'message': f"Welcome back, {user['name']}!"}).encode('utf-8'))
            except Exception as e:
                self._set_cors_headers(500)
                self.wfile.write(json.dumps({'status': 'error', 'message': f"Login failed: {e}"}).encode('utf-8'))
            finally:
                conn.close()
            return

        # 3. AUTH: Forgot Password Request Code
        elif self.path == '/api/auth/forgot-password':
            email = payload.get('email', '').strip().lower()
            if not email:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Email is required'}).encode('utf-8'))
                return

            conn = get_db_connection()
            if not conn:
                self._set_cors_headers(500)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Database connection error'}).encode('utf-8'))
                return

            try:
                cursor = conn.cursor(pymysql.cursors.DictCursor)
                cursor.execute('SELECT id, name FROM users WHERE email = %s', (email,))
                user = cursor.fetchone()

                if not user:
                    self._set_cors_headers(200)
                    self.wfile.write(json.dumps({'status': 'success', 'message': 'If your email is registered, a password reset code has been sent.', 'resetCode': '123456'}).encode('utf-8'))
                    conn.close()
                    return

                reset_code = str(secrets.randbelow(900000) + 100000)
                expiry = int(time.time()) + 900

                cursor.execute('UPDATE users SET reset_token = %s, reset_token_expiry = %s WHERE email = %s', (reset_code, expiry, email))
                
                self._set_cors_headers(200)
                self.wfile.write(json.dumps({
                    'status': 'success',
                    'message': f"Password reset verification code generated for {email}.",
                    'resetCode': reset_code
                }).encode('utf-8'))
            except Exception as e:
                self._set_cors_headers(500)
                self.wfile.write(json.dumps({'status': 'error', 'message': f"Forgot password failed: {e}"}).encode('utf-8'))
            finally:
                conn.close()
            return

        # 4. AUTH: Reset Password Execution
        elif self.path == '/api/auth/reset-password':
            email = payload.get('email', '').strip().lower()
            reset_code = payload.get('resetToken', '').strip()
            new_password = payload.get('newPassword', '')

            if not email or not reset_code or not new_password:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Email, reset code and new password required'}).encode('utf-8'))
                return

            conn = get_db_connection()
            if not conn:
                self._set_cors_headers(500)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Database connection error'}).encode('utf-8'))
                return

            try:
                cursor = conn.cursor(pymysql.cursors.DictCursor)
                cursor.execute('SELECT * FROM users WHERE email = %s AND reset_token = %s', (email, reset_code))
                user = cursor.fetchone()

                now_ts = int(time.time())
                if not user or not user.get('reset_token_expiry') or user['reset_token_expiry'] < now_ts:
                    self._set_cors_headers(400)
                    self.wfile.write(json.dumps({'status': 'error', 'message': 'Invalid or expired password reset verification code'}).encode('utf-8'))
                    conn.close()
                    return

                new_hash = hash_password(new_password)
                cursor.execute('UPDATE users SET password_hash = %s, reset_token = NULL, reset_token_expiry = NULL WHERE email = %s', (new_hash, email))

                self._set_cors_headers(200)
                self.wfile.write(json.dumps({'status': 'success', 'message': 'Password has been reset successfully! Please sign in with your new password.'}).encode('utf-8'))
            except Exception as e:
                self._set_cors_headers(500)
                self.wfile.write(json.dumps({'status': 'error', 'message': f"Reset password failed: {e}"}).encode('utf-8'))
            finally:
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
                return

            conn = get_db_connection()
            if not conn:
                self._set_cors_headers(500)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Database connection error'}).encode('utf-8'))
                return

            try:
                cursor = conn.cursor(pymysql.cursors.DictCursor)
                cursor.execute('SELECT * FROM users WHERE google_id = %s OR email = %s', (google_id, email))
                user = cursor.fetchone()

                if user:
                    cursor.execute('UPDATE users SET google_id = %s, avatar_url = %s, name = %s WHERE id = %s', (google_id or user['google_id'], avatar_url or user['avatar_url'], name or user['name'], user['id']))
                    user_id = user['id']
                    username = user['username']
                    role = user.get('role', 'user')
                else:
                    user_id = f"usr_{int(time.time()*1000)}"
                    username = email.split('@')[0]
                    created_at = time.strftime('%Y-%m-%dT%H:%M:%SZ')
                    role = 'admin' if email == 'sakthiumamaheswarit@gmail.com' else 'user'
                    cursor.execute('''
                        INSERT INTO users (id, username, email, password_hash, name, avatar_url, auth_provider, role, google_id, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ''', (user_id, username, email, '', name, avatar_url, 'google', role, google_id, created_at))

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
            except Exception as e:
                self._set_cors_headers(500)
                self.wfile.write(json.dumps({'status': 'error', 'message': f"Google Sign-In failed: {e}"}).encode('utf-8'))
            finally:
                conn.close()
            return

        # 6. ADMIN USER MANAGEMENT: Update Role
        elif self.path == '/api/users/update-role':
            user_id = payload.get('userId')
            new_role = payload.get('role', 'user')
            if not user_id:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'userId required'}).encode('utf-8'))
                return
            conn = get_db_connection()
            if conn:
                try:
                    cursor = conn.cursor()
                    cursor.execute('UPDATE users SET role = %s WHERE id = %s', (new_role, user_id))
                    conn.commit()
                    self._set_cors_headers(200)
                    self.wfile.write(json.dumps({'status': 'success', 'message': f'User role updated to {new_role}'}).encode('utf-8'))
                finally:
                    conn.close()
            return

        # 7. ADMIN USER MANAGEMENT: Reset Password
        elif self.path == '/api/users/admin-reset-password':
            user_id = payload.get('userId')
            new_pass = payload.get('newPassword')
            if not user_id or not new_pass:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'userId and newPassword required'}).encode('utf-8'))
                return
            conn = get_db_connection()
            if conn:
                try:
                    pwd_hash = hash_password(new_pass)
                    cursor = conn.cursor()
                    cursor.execute('UPDATE users SET password_hash = %s WHERE id = %s', (pwd_hash, user_id))
                    conn.commit()
                    self._set_cors_headers(200)
                    self.wfile.write(json.dumps({'status': 'success', 'message': 'User password reset successfully'}).encode('utf-8'))
                finally:
                    conn.close()
            return

        # 8. ADMIN USER MANAGEMENT: Delete User & Purge Records
        elif self.path == '/api/users/delete':
            user_id = payload.get('userId')
            if not user_id:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'userId required'}).encode('utf-8'))
                return
            if user_id == 'usr_admin':
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Cannot delete primary Admin account'}).encode('utf-8'))
                return
            conn = get_db_connection()
            if conn:
                try:
                    cursor = conn.cursor()
                    cursor.execute('DELETE FROM expenses WHERE user_id = %s', (user_id,))
                    cursor.execute('DELETE FROM accounts WHERE user_id = %s', (user_id,))
                    cursor.execute('DELETE FROM users WHERE id = %s', (user_id,))
                    conn.commit()
                    self._set_cors_headers(200)
                    self.wfile.write(json.dumps({'status': 'success', 'message': 'User account and all linked records deleted'}).encode('utf-8'))
                finally:
                    conn.close()
            return

        # Config Endpoint
        elif self.path == '/api/config':
            test_cfg = {
                'host': payload.get('host', '127.0.0.1').strip(),
                'port': int(payload.get('port', 3306)),
                'user': payload.get('user', 'root').strip(),
                'database': payload.get('database', 'smartcashflow_db').strip(),
                'password': payload.get('password', '')
            }

            test_conn = get_db_connection(create_db=True, config_override=test_cfg)
            if test_conn:
                test_conn.close()
                save_config(test_cfg)
                init_mysql_schema()
                self._set_cors_headers(200)
                self.wfile.write(json.dumps({'status': 'success', 'message': f"Connected to MySQL at {test_cfg['host']}:{test_cfg['port']}"}).encode('utf-8'))
            else:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({'status': 'error', 'message': f"Failed to connect to MySQL at {test_cfg['host']}:{test_cfg['port']}."}).encode('utf-8'))
            return

        conn = get_db_connection()
        if not conn:
            self._set_cors_headers(500)
            self.wfile.write(json.dumps({'error': 'MySQL Database disconnected'}).encode('utf-8'))
            return

        cursor = conn.cursor()

        if self.path == '/api/sync':
            if 'expenses' in payload and isinstance(payload['expenses'], list):
                cursor.execute('DELETE FROM expenses')
                for item in payload['expenses']:
                    cursor.execute('''
                        INSERT INTO expenses 
                        (id, user_id, accountId, title, amount, currency, type, sector, paymentMethod, date, recurring, status, notes)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON DUPLICATE KEY UPDATE
                        user_id=VALUES(user_id), title=VALUES(title), amount=VALUES(amount), currency=VALUES(currency),
                        type=VALUES(type), sector=VALUES(sector), paymentMethod=VALUES(paymentMethod),
                        date=VALUES(date), recurring=VALUES(recurring), status=VALUES(status), notes=VALUES(notes);
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
                        INSERT INTO accounts
                        (id, user_id, name, bank, type, currency, initialBalance)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON DUPLICATE KEY UPDATE
                        user_id=VALUES(user_id), name=VALUES(name), bank=VALUES(bank), type=VALUES(type),
                        currency=VALUES(currency), initialBalance=VALUES(initialBalance);
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
                        INSERT INTO settings (setting_key, setting_value)
                        VALUES (%s, %s)
                        ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value);
                    ''', (k, json.dumps(v)))

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({'status': 'success', 'message': 'MySQL database synced'}).encode('utf-8'))
            conn.close()
            sync_backup_file()
            return

        elif self.path == '/api/expenses':
            item = payload
            cursor.execute('''
                INSERT INTO expenses 
                (id, user_id, accountId, title, amount, currency, type, sector, paymentMethod, date, recurring, status, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                user_id=VALUES(user_id), title=VALUES(title), amount=VALUES(amount), currency=VALUES(currency),
                type=VALUES(type), sector=VALUES(sector), paymentMethod=VALUES(paymentMethod),
                date=VALUES(date), recurring=VALUES(recurring), status=VALUES(status), notes=VALUES(notes);
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
            self._set_cors_headers(200)
            self.wfile.write(json.dumps({'status': 'success', 'id': item.get('id')}).encode('utf-8'))
            conn.close()
            sync_backup_file()
            return

        elif self.path == '/api/accounts':
            acc = payload
            cursor.execute('''
                INSERT INTO accounts
                (id, user_id, name, bank, type, currency, initialBalance)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                user_id=VALUES(user_id), name=VALUES(name), bank=VALUES(bank), type=VALUES(type),
                currency=VALUES(currency), initialBalance=VALUES(initialBalance);
            ''', (
                str(acc.get('id', '')),
                str(acc.get('userId', acc.get('user_id', 'usr_admin'))),
                str(acc.get('name', '')),
                str(acc.get('bank', '')),
                str(acc.get('type', 'Checking')),
                str(acc.get('currency', 'USD')),
                float(acc.get('initialBalance', 0))
            ))
            self._set_cors_headers(200)
            self.wfile.write(json.dumps({'status': 'success', 'id': acc.get('id')}).encode('utf-8'))
            conn.close()
            sync_backup_file()
            return

        else:
            self._set_cors_headers(404)
            self.wfile.write(json.dumps({'error': 'Not Found'}).encode('utf-8'))
            conn.close()

    def do_DELETE(self):
        conn = get_db_connection()
        if not conn:
            self._set_cors_headers(500)
            self.wfile.write(json.dumps({'error': 'MySQL Database disconnected'}).encode('utf-8'))
            return

        cursor = conn.cursor()

        if self.path.startswith('/api/expenses/'):
            expense_id = self.path.replace('/api/expenses/', '').strip()
            cursor.execute('DELETE FROM expenses WHERE id = %s', (expense_id,))
            self._set_cors_headers(200)
            self.wfile.write(json.dumps({'status': 'deleted', 'id': expense_id}).encode('utf-8'))
        elif self.path.startswith('/api/accounts/'):
            account_id = self.path.replace('/api/accounts/', '').strip()
            cursor.execute('DELETE FROM accounts WHERE id = %s', (account_id,))
            self._set_cors_headers(200)
            self.wfile.write(json.dumps({'status': 'deleted', 'id': account_id}).encode('utf-8'))
        else:
            self._set_cors_headers(404)
            self.wfile.write(json.dumps({'error': 'Not Found'}).encode('utf-8'))

        conn.close()
        sync_backup_file()

def run():
    load_config()
    print(f"⏳ Connecting to MySQL Server on {mysql_config['host']}:{mysql_config['port']}...")
    init_mysql_schema()

    server_address = ('', API_PORT)
    httpd = HTTPServer(server_address, MySQLRequestHandler)
    print(f"🚀 SmartCashflow MySQL Gateway running at http://localhost:{API_PORT}")
    httpd.serve_forever()

if __name__ == '__main__':
    run()
