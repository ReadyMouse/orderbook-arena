#!/bin/bash

# Launch script for Orderbook Arena
# Starts backend and frontend, killing any existing instances first

# Don't exit on error for conditional checks
set +e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to kill process on a port (ONLY processes LISTENING, not connected)
kill_port() {
    local port=$1
    local name=$2
    # Only get processes that are LISTENING on the port, not just connected
    local pids=$(lsof -ti:$port -sTCP:LISTEN 2>/dev/null || true)
    if [ -n "$pids" ]; then
        for pid in $pids; do
            # Double-check it's actually listening
            local cmd=$(ps -p $pid -o comm= 2>/dev/null || echo "")
            if [ -n "$cmd" ]; then
                echo -e "${YELLOW}Stopping existing $name on port $port (PID: $pid, cmd: $cmd)...${NC}"
                # Try graceful shutdown first
                kill $pid 2>/dev/null || true
                sleep 1
                # Force kill only if still running
                if kill -0 $pid 2>/dev/null; then
                    kill -9 $pid 2>/dev/null || true
                fi
            fi
        done
        sleep 1
    fi
}

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"
    # Only kill processes we started
    if [ -n "$BACKEND_PID" ] && kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "${YELLOW}Stopping backend (PID: $BACKEND_PID)...${NC}"
        kill $BACKEND_PID 2>/dev/null || true
        sleep 1
        kill -9 $BACKEND_PID 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ] && kill -0 $FRONTEND_PID 2>/dev/null; then
        echo -e "${YELLOW}Stopping frontend (PID: $FRONTEND_PID)...${NC}"
        kill $FRONTEND_PID 2>/dev/null || true
        sleep 1
        kill -9 $FRONTEND_PID 2>/dev/null || true
    fi
    # Also clean up ports, but more carefully
    kill_port 8080 "backend"
    kill_port 5173 "frontend"
    exit 0
}

# Trap Ctrl+C and cleanup
trap cleanup SIGINT SIGTERM

echo -e "${GREEN}=== Orderbook Arena Launcher ===${NC}\n"

# Kill existing instances
echo -e "${YELLOW}Checking for existing instances...${NC}"
kill_port 8080 "backend"
kill_port 5173 "frontend"

# Start backend
echo -e "${GREEN}Starting backend on port 8080...${NC}"
cd backend
cargo run > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 2

# Check if backend started successfully
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${RED}Backend failed to start. Check backend.log for details.${NC}"
    exit 1
fi

echo -e "${GREEN}Backend started (PID: $BACKEND_PID)${NC}"

# Start frontend
echo -e "${GREEN}Starting frontend on port 5173...${NC}"
cd frontend
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Wait a moment for frontend to start
sleep 2

# Check if frontend started successfully
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${RED}Frontend failed to start. Check frontend.log for details.${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

echo -e "${GREEN}Frontend started (PID: $FRONTEND_PID)${NC}\n"

echo -e "${GREEN}✓ Both services are running!${NC}"
echo -e "${GREEN}Backend: http://localhost:8080${NC}"
echo -e "${GREEN}Frontend: http://localhost:5173${NC}"
echo -e "\n${YELLOW}Press Ctrl+C to stop both services${NC}\n"

# Wait for user interrupt and monitor processes
while true; do
    # Check if processes are still running
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "${RED}Backend process died. Check backend.log for details.${NC}"
        kill $FRONTEND_PID 2>/dev/null || true
        exit 1
    fi
    
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        echo -e "${RED}Frontend process died. Check frontend.log for details.${NC}"
        kill $BACKEND_PID 2>/dev/null || true
        exit 1
    fi
    
    sleep 1
done

