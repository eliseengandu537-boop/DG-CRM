# DG Property CRM Monorepo

This repository contains:

- `frontend`: Next.js + Tailwind CRM UI
- `backend`: Express + TypeScript + Prisma API (PostgreSQL)
- `docker-compose.yml`: local full stack (frontend, backend, PostgreSQL)

## Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL (local) or Docker

## Local Development

### 1) Backend

```bash
cd backend
npm install
npm run prisma:generate
npm run dev
```

Backend runs on `http://localhost:5000`.

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.

## Docker (Local)

From repo root:

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5000`
- PostgreSQL: `localhost:5432`

## Environment Configuration

Use the `.env.*.example` files in `backend` and `frontend` as templates.

Important backend vars:

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `FRONTEND_URL`
- SMTP variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) if broker password emails are required

## Authentication Notes

- Access tokens are sent as Bearer tokens.
- Refresh tokens are issued via `httpOnly` cookies on `/api/auth`.
- WebSocket connections require a valid access token.

## Testing

Backend tests:

```bash
cd backend
npm test
```

## Production

- `docker-compose.prod.yml` expects `backend/.env.production` and `frontend/.env.production`.
- In production, `DATABASE_URL` should point to managed PostgreSQL.
# Auto-deploy test
