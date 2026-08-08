#!/usr/bin/env python3
"""
SmartCashflow Unified Runner
Starts both the Backend REST API and the Frontend Web UI servers,
then automatically opens the web app in your default browser.
"""

import os
import sys
import time
import signal
import webbrowser
import subprocess

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(base_dir)

    print("=" * 60)
    print("      🚀 SmartCashflow Application Launcher")
    print("=" * 60)

    # Detect MySQL vs SQLite
    backend_script = os.path.join("server", "sql_server.py") if os.path.exists(os.path.join("server", "sql_server.py")) else "sql_server.py"
    try:
        import pymysql
        conn = pymysql.connect(host='127.0.0.1', port=3306, user='root', password='', connect_timeout=2)
        conn.close()
        mysql_path = os.path.join("server", "mysql_server.py") if os.path.exists(os.path.join("server", "mysql_server.py")) else "mysql_server.py"
        if os.path.exists(mysql_path):
            backend_script = mysql_path
            print("✅ Local MySQL Server detected (127.0.0.1:3306). Using MySQL backend.")
    except Exception:
        print("ℹ️  Using SQLite Engine (smartcashflow.db).")

    # Start Backend API on port 8081
    print(f"🔌 Starting Backend REST Gateway on port 8081 ({backend_script})...")
    backend_proc = subprocess.Popen([sys.executable, backend_script])

    # Start Frontend Web Server on port 8000
    print("🌐 Starting Frontend Web Server on port 8000...")
    frontend_proc = subprocess.Popen([sys.executable, "-m", "http.server", "8000"])

    # Graceful shutdown handler
    def cleanup(sig=None, frame=None):
        print("\n🛑 Stopping servers...")
        try:
            backend_proc.terminate()
            frontend_proc.terminate()
            backend_proc.wait(timeout=2)
            frontend_proc.wait(timeout=2)
        except Exception:
            backend_proc.kill()
            frontend_proc.kill()
        print("✨ SmartCashflow servers stopped successfully.")
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    time.sleep(1.2)
    url = "http://localhost:8000"
    print("=" * 60)
    print(f"✨ SmartCashflow is running at: {url}")
    print(f"🔌 REST API Gateway:          http://localhost:8081")
    print("=" * 60)
    print("Press Ctrl+C to stop the servers.\n")

    # Open in browser
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"Could not open browser automatically: {e}")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        cleanup()

if __name__ == '__main__':
    main()
