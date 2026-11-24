#!/usr/bin/env bash
# KhataGST Database Migration Script (Unix / Linux / macOS)
set -e

echo "Starting KhataGST Alembic migration..."
cd "$(dirname "$0")/../backend"
python scripts/migrate.py
echo "Migration complete!"

