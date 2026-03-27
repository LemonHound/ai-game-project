# Stage 1: Build React frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.ts tsconfig.json tsconfig.node.json postcss.config.js ./
COPY src/frontend/ ./src/frontend/
RUN npm run build

# Stage 2: Python runtime
FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
COPY --from=frontend-builder /app/dist/ ./dist/
COPY alembic.ini ./
COPY scripts/migrations/ ./scripts/migrations/

WORKDIR /app/src/backend

CMD exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}
