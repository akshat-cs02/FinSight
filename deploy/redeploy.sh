#!/bin/bash
# Quick redeploy after code changes — run on Oracle Cloud VM
set -e
cd /opt/tickerscope

echo "=== Redeploying TickerScope ==="

# Pull latest code
git pull origin main

# Rebuild + restart backend
cd backend
sudo docker-compose -f docker-compose.prod.yml up -d --build

# Rebuild frontend
cd ../frontend
npm install
npm run build
sudo cp -r dist/* /var/www/tickerscope/
sudo cp dist/landing.html /var/www/tickerscope/ 2>/dev/null || true

echo "=== Redeploy complete ==="
