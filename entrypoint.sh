#!/bin/sh
set -e

cd /app
alembic upgrade head
python scripts/seed_test_data.py

exec "$@"
