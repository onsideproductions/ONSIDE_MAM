#!/usr/bin/env bash
# Promote a user to admin by email.
# Usage: ./make-admin.sh user@example.com

set -euo pipefail

EMAIL="${1:-}"
if [ -z "$EMAIL" ]; then
  echo "Usage: $0 <email>"
  exit 1
fi

# Load DATABASE_URL from .env at the repo root if not already set
if [ -z "${DATABASE_URL:-}" ]; then
  if [ -f "$(dirname "$0")/../../../.env" ]; then
    set -a; . "$(dirname "$0")/../../../.env"; set +a
  fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set"
  exit 1
fi

result=$(psql "$DATABASE_URL" -tAc "UPDATE \"user\" SET role = 'admin' WHERE email = '$EMAIL' RETURNING id, email, role;")

if [ -z "$result" ]; then
  echo "No user found with email: $EMAIL"
  exit 1
fi

echo "Promoted to admin: $result"
