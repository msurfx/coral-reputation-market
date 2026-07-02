#!/bin/bash
set -e
export PATH="/home/codespace/nvm/current/bin:$PATH"
cd /workspaces/coral-reputation-market

echo "[startup] launching coral..."
nohup docker compose up coral > /tmp/coral.log 2>&1 &
sleep 5

echo "[startup] launching feed server..."
cd examples/marketplace/feed
nohup npm start > /tmp/feed.log 2>&1 &

echo "[startup] launching web (vite)..."
cd ../web
nohup npm run dev > /tmp/web.log 2>&1 &

disown -a
echo "[startup] all services launched — check /tmp/coral.log /tmp/feed.log /tmp/web.log if anything looks off"
