#!/bin/bash
# One-command demo runner for judges.
# Chains setup, funding checks, build, and launch. On-chain funding still needs a
# one-time manual faucet visit (unavoidable on devnet) — this script tells you
# exactly what to fund and pauses for it.
set -e
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "==> First run: generating wallets..."
  npm run setup
fi

echo ""
echo "==> Wallets for this environment:"
cat WALLETS.txt
echo ""
echo "If you haven't already, fund the BUYER and SELLER addresses above at:"
echo "  https://faucet.solana.com"
read -p "Press Enter once both wallets are funded... " _

if [ -z "$(grep '^TXLINE_API_KEY=.\+' .env 2>/dev/null)" ]; then
  echo "==> Minting devnet TXLINE token..."
  (cd examples/txodds && npm install && npm run mint)
fi

if ! docker images | grep -q "seller-agent.*0.1.0"; then
  echo "==> Building agent images (first run only, ~1-2 min)..."
  bash build-agents.sh
fi

echo "==> Starting coral-server..."
docker compose up -d coral
sleep 5

echo "==> Launching a live market round..."
npm run marketplace
