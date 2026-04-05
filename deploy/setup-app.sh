#!/usr/bin/env bash
#
# ONSIDE MAM - Application Setup
# Run as onside user from /opt/onside-mam:
#   cd /opt/onside-mam && bash deploy/setup-app.sh
#
set -euo pipefail

APP_DIR="/opt/onside-mam"
cd "$APP_DIR"

echo "========================================="
echo " ONSIDE MAM - Application Setup"
echo "========================================="
echo ""

# Check we're the onside user
if [ "$(whoami)" != "onside" ]; then
  echo "WARNING: Not running as 'onside' user. Recommended: sudo su - onside"
fi

# =========================================
# 1. INSTALL DEPENDENCIES
# =========================================
echo "[1/7] Installing Node.js dependencies..."
npm install
echo "  ✓ Dependencies installed"

# =========================================
# 2. BUILD ALL PACKAGES
# =========================================
echo ""
echo "[2/7] Building all packages..."
npx turbo build
echo "  ✓ Build complete"

# =========================================
# 3. CREATE .ENV FILE
# =========================================
echo ""
echo "[3/7] Setting up environment..."
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"

  # Generate a random auth secret
  AUTH_SECRET=$(openssl rand -hex 32)
  sed -i "s/generate-a-random-secret-here/$AUTH_SECRET/" "$APP_DIR/.env"

  echo ""
  echo "  ╔══════════════════════════════════════════════════════╗"
  echo "  ║  .env file created from .env.example                ║"
  echo "  ║                                                     ║"
  echo "  ║  YOU MUST EDIT IT NOW with your real credentials:   ║"
  echo "  ║    nano /opt/onside-mam/.env                        ║"
  echo "  ║                                                     ║"
  echo "  ║  Required:                                          ║"
  echo "  ║    - WASABI_ACCESS_KEY_ID                           ║"
  echo "  ║    - WASABI_SECRET_ACCESS_KEY                       ║"
  echo "  ║    - WASABI_BUCKET                                  ║"
  echo "  ║    - WASABI_ENDPOINT                                ║"
  echo "  ║    - GEMINI_API_KEY                                 ║"
  echo "  ║                                                     ║"
  echo "  ║  AUTH_SECRET has been auto-generated.                ║"
  echo "  ╚══════════════════════════════════════════════════════╝"
  echo ""
  read -p "  Press Enter after you've edited .env to continue..."
else
  echo "  .env already exists, skipping"
fi

# =========================================
# 4. START DOCKER SERVICES (PostgreSQL + Redis)
# =========================================
echo ""
echo "[4/7] Starting PostgreSQL and Redis..."
docker compose up -d
echo "  Waiting for PostgreSQL to be ready..."
sleep 5

# Wait for PostgreSQL health check
for i in {1..30}; do
  if docker exec onside-postgres pg_isready -U onside -d onside_mam &>/dev/null; then
    echo "  ✓ PostgreSQL ready"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "  ERROR: PostgreSQL failed to start"
    docker compose logs postgres
    exit 1
  fi
  sleep 1
done

# Check Redis
if docker exec onside-redis redis-cli ping | grep -q PONG; then
  echo "  ✓ Redis ready"
else
  echo "  ERROR: Redis failed to start"
  exit 1
fi

# =========================================
# 5. PUSH DATABASE SCHEMA
# =========================================
echo ""
echo "[5/7] Creating database tables..."
cd "$APP_DIR/apps/api"
npx drizzle-kit push --force
cd "$APP_DIR"
echo "  ✓ Database schema created"

# =========================================
# 6. INSTALL SYSTEMD SERVICES
# =========================================
echo ""
echo "[6/7] Installing systemd services..."

# This step needs sudo
echo "  (This step requires sudo for systemd setup)"

sudo cp "$APP_DIR/deploy/systemd/onside-api.service" /etc/systemd/system/
sudo cp "$APP_DIR/deploy/systemd/onside-worker.service" /etc/systemd/system/
sudo cp "$APP_DIR/deploy/systemd/onside-web.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable onside-api onside-worker onside-web
echo "  ✓ systemd services installed and enabled"

# =========================================
# 7. INSTALL NGINX CONFIG
# =========================================
echo ""
echo "[7/7] Configuring NGINX..."

sudo cp "$APP_DIR/deploy/nginx/onside-mam-http.conf" /etc/nginx/sites-available/onside-mam
sudo ln -sf /etc/nginx/sites-available/onside-mam /etc/nginx/sites-enabled/onside-mam
sudo rm -f /etc/nginx/sites-enabled/default

# Test NGINX config
if sudo nginx -t 2>/dev/null; then
  sudo systemctl reload nginx
  echo "  ✓ NGINX configured"
else
  echo "  ERROR: NGINX config test failed"
  sudo nginx -t
  exit 1
fi

# =========================================
# START EVERYTHING
# =========================================
echo ""
echo "Starting ONSIDE MAM services..."
sudo systemctl start onside-api
sleep 2
sudo systemctl start onside-worker
sudo systemctl start onside-web
sleep 2

# =========================================
# VERIFY
# =========================================
echo ""
echo "Checking services..."

check_service() {
  if sudo systemctl is-active --quiet "$1"; then
    echo "  ✓ $1 is running"
  else
    echo "  ✗ $1 FAILED - check logs: sudo journalctl -u $1 -n 50"
  fi
}

check_service onside-api
check_service onside-worker
check_service onside-web

# Health check
sleep 2
if curl -s http://localhost:3001/health | grep -q '"status":"ok"'; then
  echo "  ✓ API health check passed"
else
  echo "  ⚠ API health check failed (may still be starting)"
fi

SERVER_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "========================================="
echo " ONSIDE MAM is running!"
echo "========================================="
echo ""
echo " Access the app:"
echo "   http://${SERVER_IP}/"
echo ""
echo " Useful commands:"
echo "   sudo systemctl status onside-api      # API status"
echo "   sudo systemctl status onside-worker   # Worker status"
echo "   sudo systemctl status onside-web      # Web status"
echo "   sudo journalctl -u onside-api -f      # API logs (live)"
echo "   sudo journalctl -u onside-worker -f   # Worker logs (live)"
echo "   docker compose logs -f                # DB/Redis logs"
echo ""
echo " To add SSL later (when you have a domain):"
echo "   sudo apt install certbot python3-certbot-nginx"
echo "   sudo certbot --nginx -d yourdomain.com"
echo ""
