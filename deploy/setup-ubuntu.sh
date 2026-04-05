#!/usr/bin/env bash
#
# ONSIDE MAM - Ubuntu 24.04 LTS Server Setup
# Run as root: sudo bash setup-ubuntu.sh
#
set -euo pipefail

echo "========================================="
echo " ONSIDE MAM - Server Setup"
echo " Ubuntu 24.04 LTS"
echo "========================================="
echo ""

# Check running as root
if [ "$EUID" -ne 0 ]; then
  echo "ERROR: Please run as root (sudo bash setup-ubuntu.sh)"
  exit 1
fi

# =========================================
# 1. SYSTEM UPDATE
# =========================================
echo "[1/9] Updating system packages..."
apt update -y && apt upgrade -y
echo "  ✓ System updated"

# =========================================
# 2. INSTALL CORE DEPENDENCIES
# =========================================
echo ""
echo "[2/9] Installing core dependencies..."
apt install -y \
  curl \
  wget \
  gnupg \
  ca-certificates \
  lsb-release \
  software-properties-common \
  build-essential \
  git \
  unzip \
  htop
echo "  ✓ Core dependencies installed"

# =========================================
# 3. INSTALL NODE.JS 22 LTS
# =========================================
echo ""
echo "[3/9] Installing Node.js 22 LTS..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
fi
echo "  Node.js version: $(node --version)"
echo "  npm version: $(npm --version)"
echo "  ✓ Node.js installed"

# =========================================
# 4. INSTALL FFMPEG
# =========================================
echo ""
echo "[4/9] Installing FFmpeg..."
apt install -y ffmpeg
echo "  FFmpeg version: $(ffmpeg -version | head -1)"
echo "  ✓ FFmpeg installed"

# =========================================
# 5. INSTALL DOCKER + DOCKER COMPOSE
# =========================================
echo ""
echo "[5/9] Installing Docker..."
if ! command -v docker &> /dev/null; then
  # Add Docker's official GPG key
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  # Add the Docker repository
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt update -y
  apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
echo "  Docker version: $(docker --version)"
echo "  ✓ Docker installed"

# =========================================
# 6. INSTALL NGINX
# =========================================
echo ""
echo "[6/9] Installing NGINX..."
apt install -y nginx
systemctl enable nginx
echo "  NGINX version: $(nginx -v 2>&1)"
echo "  ✓ NGINX installed"

# =========================================
# 7. CREATE ONSIDE USER + DIRECTORIES
# =========================================
echo ""
echo "[7/9] Creating onside user and directories..."

# Create system user if it doesn't exist
if ! id "onside" &>/dev/null; then
  useradd --system --create-home --shell /bin/bash onside
  echo "  Created user: onside"
fi

# Add onside user to docker group so it can manage containers
usermod -aG docker onside

# Create app directory
mkdir -p /opt/onside-mam
chown onside:onside /opt/onside-mam

echo "  ✓ User and directories ready"

# =========================================
# 8. CONFIGURE FIREWALL
# =========================================
echo ""
echo "[8/9] Configuring firewall..."
if command -v ufw &> /dev/null; then
  ufw allow OpenSSH
  ufw allow 'Nginx Full'
  ufw --force enable
  echo "  ✓ Firewall configured (SSH + HTTP/HTTPS)"
else
  echo "  ⚠ ufw not found, skipping firewall config"
fi

# =========================================
# 9. SUMMARY
# =========================================
echo ""
echo "========================================="
echo " System setup complete!"
echo "========================================="
echo ""
echo " Installed:"
echo "   - Node.js $(node --version)"
echo "   - npm $(npm --version)"
echo "   - FFmpeg $(ffmpeg -version 2>&1 | head -1 | awk '{print $3}')"
echo "   - Docker $(docker --version | awk '{print $3}' | tr -d ',')"
echo "   - NGINX $(nginx -v 2>&1 | awk -F/ '{print $2}')"
echo "   - Git $(git --version | awk '{print $3}')"
echo ""
echo " Next steps:"
echo "   1. Switch to onside user:"
echo "      sudo su - onside"
echo ""
echo "   2. Clone the repo (you'll need a GitHub token):"
echo "      git clone https://github.com/onsideproductions/ONSIDE_MAM.git /opt/onside-mam"
echo ""
echo "   3. Run the app setup script:"
echo "      cd /opt/onside-mam && bash deploy/setup-app.sh"
echo ""
