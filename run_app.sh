#!/usr/bin/env bash
# ==============================================================================
# SmartCashflow - Unified Application Launcher
# Starts Backend REST Gateway (Port 8081) + Web Frontend UI (Port 8000)
# ==============================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}      🚀 SmartCashflow Application Launcher          ${NC}"
echo -e "${CYAN}======================================================${NC}"

# Check for Python 3
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Error: python3 is not installed or not in PATH.${NC}"
    exit 1
fi

# Clean up any existing instances on ports 8000 and 8081
echo -e "${BLUE}🔍 Checking ports 8000 and 8081...${NC}"
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:8081 | xargs kill -9 2>/dev/null || true

# Determine backend server (MySQL vs SQLite)
BACKEND_SCRIPT="server/sql_server.py"
if [ ! -f "$BACKEND_SCRIPT" ] && [ -f "sql_server.py" ]; then
    BACKEND_SCRIPT="sql_server.py"
fi

python3 -c "import pymysql; conn = pymysql.connect(host='127.0.0.1', port=3306, user='root', password='', connect_timeout=2); conn.close()" 2>/dev/null && MYSQL_AVAILABLE=true || MYSQL_AVAILABLE=false

if [ "$MYSQL_AVAILABLE" = true ]; then
    if [ -f "server/mysql_server.py" ]; then
        BACKEND_SCRIPT="server/mysql_server.py"
        echo -e "${GREEN}✅ Local MySQL Server detected (127.0.0.1:3306). Using MySQL backend.${NC}"
    elif [ -f "mysql_server.py" ]; then
        BACKEND_SCRIPT="mysql_server.py"
        echo -e "${GREEN}✅ Local MySQL Server detected (127.0.0.1:3306). Using MySQL backend.${NC}"
    fi
else
    echo -e "${YELLOW}ℹ️  Using SQLite Engine (smartcashflow.db).${NC}"
fi

# Trap to gracefully stop background processes on exit (Ctrl+C)
cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down SmartCashflow servers...${NC}"
    if [ -n "$BACKEND_PID" ]; then kill "$BACKEND_PID" 2>/dev/null || true; fi
    if [ -n "$FRONTEND_PID" ]; then kill "$FRONTEND_PID" 2>/dev/null || true; fi
    echo -e "${GREEN}✨ All servers stopped successfully.${NC}"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 1. Start Backend REST Gateway on Port 8081
echo -e "${BLUE}🚀 Starting Backend REST Gateway on port 8081 ($BACKEND_SCRIPT)...${NC}"
python3 "$BACKEND_SCRIPT" &
BACKEND_PID=$!

# 2. Start Frontend Web Server on Port 8000
echo -e "${BLUE}🌐 Starting Web UI Server on port 8000...${NC}"
python3 -m http.server 8000 &
FRONTEND_PID=$!

# Wait briefly for servers to initialize
sleep 1.2

echo -e "${GREEN}======================================================${NC}"
echo -e "${GREEN}  ✨ SmartCashflow is now running!                   ${NC}"
echo -e "${GREEN}  🌐 Web Application: ${CYAN}http://localhost:8000           ${NC}"
echo -e "${GREEN}  🔌 Backend REST API: ${CYAN}http://localhost:8081          ${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "${YELLOW}Press [Ctrl+C] to stop all servers.${NC}\n"

# Open in default browser
if command -v open &> /dev/null; then
    open "http://localhost:8000"
elif command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:8000"
elif command -v start &> /dev/null; then
    start "http://localhost:8000"
fi

# Wait for both processes
wait
