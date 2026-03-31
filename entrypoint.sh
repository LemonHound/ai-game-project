#!/bin/sh
set -e

echo "Waiting for database..."
until python -c "
import socket, os
s = socket.create_connection((os.environ.get('DB_HOST', 'db'), int(os.environ.get('DB_PORT', 5432))), timeout=1)
s.close()
" > /dev/null 2>&1; do
  sleep 1
done
echo "Database ready."

cd /app
alembic upgrade head
python scripts/seed_test_data.py

cd /app/src/backend
exec "$@"
