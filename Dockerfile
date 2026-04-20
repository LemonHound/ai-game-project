# Stage 1: Build React frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.ts tsconfig.json tsconfig.node.json postcss.config.js ./
COPY src/frontend/ ./src/frontend/
RUN npm run build

# Stage 2: Python runtime
FROM python:3.14-slim
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
COPY --from=frontend-builder /app/dist/ ./dist/
COPY alembic.ini ./
COPY scripts/ ./scripts/
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

WORKDIR /app/src/backend

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
