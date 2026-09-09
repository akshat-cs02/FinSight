#!/bin/bash
# TickerScope Oracle Cloud Deploy Script
# Run this on a FRESH Ubuntu 22.04 VM to set up everything
set -e

echo "=== TickerScope Deploy ==="

# ── 1. System updates ──
echo "[1/7] Updating system..."
sudo apt update && sudo apt upgrade -y

# ── 2. Install Docker ──
echo "[2/7] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker $USER
    echo "Docker installed. Log out and back in for group changes."
fi

# ── 3. Install Docker Compose ──
echo "[3/7] Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
        -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# ── 4. Install Nginx + Certbot ──
echo "[4/7] Installing Nginx + Certbot..."
sudo apt install -y nginx certbot python3-certbot-nginx

# ── 5. Clone repo ──
echo "[5/7] Cloning TickerScope..."
if [ ! -d "/opt/tickerscope" ]; then
    sudo git clone https://github.com/akshat-cs02/FinSight.git /opt/tickerscope
fi
cd /opt/tickerscope

# ── 6. Setup backend ──
echo "[6/7] Building backend..."
cd backend
if [ ! -f ".env.production" ]; then
    echo "Creating .env.production from template..."
    cp .env.example .env.production
    echo ">>> EDIT /opt/tickerscope/backend/.env.production with real values <<<"
fi
sudo docker-compose -f docker-compose.prod.yml up -d --build

# ── 7. Setup frontend + Nginx ──
echo "[7/7] Setting up frontend + Nginx..."
cd /opt/tickerscope/frontend
sudo mkdir -p /var/www/tickerscope
sudo cp -r dist/* /var/www/tickerscope/
sudo cp dist/landing.html /var/www/tickerscope/ 2>/dev/null || true

# Nginx config
sudo cp /opt/tickerscope/deploy/nginx/tickerscope /etc/nginx/sites-available/tickerscope
sudo ln -sf /etc/nginx/sites-available/tickerscope /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "=== DONE ==="
echo "1. Edit .env.production: sudo nano /opt/tickerscope/backend/.env.production"
echo "2. Restart backend: cd /opt/tickerscope/backend && sudo docker-compose -f docker-compose.prod.yml restart"
echo "3. Point DNS: tickerscope.xyz A record → $(curl -s ifconfig.me)"
echo "4. SSL: sudo certbot --nginx -d tickerscope.xyz -d www.tickerscope.xyz"
echo ""
