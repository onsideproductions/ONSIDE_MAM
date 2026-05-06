#!/usr/bin/env bash
# ONSIDE MAM update script.
#
# Usage:
#   sudo /opt/onside-mam/deploy/update.sh           # standard update
#   sudo /opt/onside-mam/deploy/update.sh --schema  # also run drizzle db:push
#   sudo /opt/onside-mam/deploy/update.sh --skip-pull
#
# What it does:
#   1. git pull
#   2. npm install (only if package.json changed)
#   3. stop web service
#   4. clean web build directory
#   5. turbo build --force
#   6. (optional) drizzle db:push for schema changes
#   7. restart api / worker / web services
#   8. show status

set -euo pipefail

cd /opt/onside-mam

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

step() { echo -e "\n${BOLD}${GREEN}==>${NC}${BOLD} $*${NC}"; }
warn() { echo -e "${YELLOW}!! $*${NC}"; }
fail() { echo -e "${RED}xx $*${NC}"; exit 1; }

# Parse args
DO_PULL=1
DO_SCHEMA=0
for arg in "$@"; do
  case "$arg" in
    --skip-pull) DO_PULL=0 ;;
    --schema)    DO_SCHEMA=1 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) fail "Unknown arg: $arg" ;;
  esac
done

# 1) Pull latest
PACKAGE_HASH_BEFORE=""
if [ -f package-lock.json ]; then
  PACKAGE_HASH_BEFORE=$(sha256sum package-lock.json | awk '{print $1}')
fi

if [ $DO_PULL -eq 1 ]; then
  step "Pulling latest from git"
  git pull --ff-only
else
  warn "Skipping git pull"
fi

# 2) npm install only if lockfile changed
PACKAGE_HASH_AFTER=$(sha256sum package-lock.json | awk '{print $1}')
if [ "$PACKAGE_HASH_BEFORE" != "$PACKAGE_HASH_AFTER" ]; then
  step "package-lock.json changed - running npm install"
  npm install
else
  echo "  package-lock.json unchanged, skipping npm install"
fi

# 3) Stop web (it's the only service that holds stale build files)
step "Stopping onside-web"
systemctl stop onside-web || warn "onside-web wasn't running"

# 4) Clean web build dir to avoid stale chunk references
step "Clearing web build directory"
rm -rf apps/web/build

# 5) Build everything
step "Building (turbo)"
npx turbo build --force

# 6) Optional schema push
if [ $DO_SCHEMA -eq 1 ]; then
  step "Pushing schema (drizzle db:push)"
  ( cd apps/api && npm run db:push )
fi

# 7) Restart services
step "Restarting services"
systemctl restart onside-api
systemctl restart onside-worker
systemctl start onside-web    # was stopped, so start (not restart)

# 8) Status
step "Status"
sleep 1
for svc in onside-api onside-worker onside-web; do
  state=$(systemctl is-active "$svc" || true)
  if [ "$state" = "active" ]; then
    echo -e "  ${GREEN}●${NC} $svc"
  else
    echo -e "  ${RED}●${NC} $svc ($state)"
  fi
done

echo -e "\n${GREEN}${BOLD}Update complete.${NC}"
echo "Tail logs: sudo journalctl -u onside-api -u onside-worker -u onside-web -f"
