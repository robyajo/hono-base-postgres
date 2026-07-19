# 📘 Developer Manual Book & Architecture Guide

Welcome to the **Hono Base Postgres** project manual! This guide provides full context, setup instructions, database management rules, and API design guidelines for developers working on this project.

---

## 🛠️ Technology Stack

| Layer | Technology | Description |
|---|---|---|
| **Runtime & Package Manager** | **Bun** (`v1.3+`) | Fast JavaScript/TypeScript engine & dependency manager |
| **Web Framework** | **Hono** (`v4.x`) | Lightweight, ultra-fast web framework for Bun |
| **Database** | **PostgreSQL** (`v14+`) | Relational database via `postgres` (postgres-js) driver |
| **ORM** | **Drizzle ORM** | Type-safe SQL query builder and schema management |
| **Authentication** | **Better Auth** & **JWT** | Dual auth support (Better Auth sessions + JWT Bearer tokens) |
| **API Documentation** | **Swagger UI** & **OpenAPI** | Interactive docs at `/api/doc` & JSON spec at `/api/openapi` |

---

## 📁 Directory Structure

```
hono-base-postgres/
├── .env                  # Active environment variables
├── .env.example          # Environment template
├── drizzle.config.ts     # Drizzle Kit configuration (PostgreSQL dialect)
├── package.json          # Dependencies & scripts
├── finish.sh             # Production build & schema deployment script
├── gitdone.sh            # Git cleanup script
├── manual-book-dev.md    # Developer manual documentation
└── src/
    ├── index.ts          # Main Bun server entry point & static asset serving
    ├── index.html        # Modern developer landing dashboard
    ├── auth.ts           # Better Auth instance & social OAuth provider setup
    ├── config/
    │   └── drizzle.ts    # Zod environment variable validation & config export
    ├── db/
    │   ├── index.ts      # Drizzle database client initialization
    │   └── schema/
    │       ├── index.ts  # Schema re-export entry point
    │       └── user.ts   # Combined PostgreSQL tables (user, session, account, verification, refreshToken)
    ├── lib/
    │   ├── crypto.ts     # Bun native password hashing (`Bun.password`) & account sync
    │   ├── avatar.ts     # Local avatar downloader utility
    │   └── logger.ts     # Custom file logger writing to src/storage/log/log.log
    ├── middleware/
    │   ├── auth.ts          # Hybrid session & JWT Bearer authentication middleware
    │   ├── ensureAdmin.ts   # Admin role guard middleware
    │   ├── ensureUser.ts    # User role guard middleware
    │   ├── errorHandler.ts  # Global exception handler
    │   └── requestLogger.ts # Error-only HTTP request logger
    ├── routes/
    │   ├── index.ts      # Main API router (/api/health, /api/doc, /api/openapi, etc.)
    │   └── auth.ts       # Auth endpoints (/register, /login, /refresh, /logout, /google-mobile)
    └── storage/
        ├── app/public/avatars/ # Statically served user avatar images (/storage/avatars/*)
        └── log/                # Application logs (src/storage/log/log.log)
```

---

## ⚙️ Environment Configuration (`.env`)

Create or update your `.env` file based on `.env.example`:

```env
PORT=8000
BASE_URL=http://localhost:8000
APP_NAME="Hono Base Postgres"

# Locale & Timezone
APP_TIMEZONE=Asia/Jakarta
APP_LOCALE=id

# PostgreSQL Connection
DB_USER=postgres
DB_PASSWORD=12341234
DB_NAME=hono_base
DB_HOST=127.0.0.1
DB_PORT=5432

# JWT Security
JWT_SECRET=super_secret_jwt_key_change_in_production_32_chars
JWT_EXPIRES_IN=7d

# Better Auth Configuration
BETTER_AUTH_SECRET=your_better_auth_secret_minimum_32_characters_long
BETTER_AUTH_COOKIE_DOMAIN=localhost
BETTER_AUTH_URL=http://localhost:8000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8000
```

---

## 🚀 Development Commands

```bash
# Install dependencies
bun install

# Start development server with hot-reload
bun run dev

# Type check codebase
bun x tsc --noEmit

# Generate Drizzle migration files
bun run db:generate

# Push schema changes directly to PostgreSQL database
bun run db:push

# Launch Drizzle Studio (Database GUI)
bun run db:studio

# Production deployment script
./finish.sh
```

---

## 🔐 Authentication Architecture

The application supports **hybrid authentication**:

1. **JWT Bearer Token Authentication**:
   - `POST /api/auth/login` returns an `accessToken` (valid for 15 minutes) and a `refreshToken` (valid for 7 days).
   - Use `Authorization: Bearer <accessToken>` header for API requests.
   - Use `POST /api/auth/refresh` with `{ "refreshToken": "..." }` to rotate refresh tokens and obtain a new `accessToken`.

2. **Better Auth Session Cookie Authentication**:
   - Web clients can authenticate using standard Better Auth cookies or social OAuth endpoints (`/api/auth/signin/google`, etc.).
   - `sessionMiddleware` seamlessly validates both Bearer tokens and cookie sessions, attaching `c.get("user")` and `c.get("session")` to the Hono context.

---

## 🌐 API Dashboard & Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/` | `GET` | Developer Landing Dashboard |
| `/manual-book` | `GET` | View / Download this Manual Book (`manual-book-dev.md`) |
| `/download/collection` | `GET` | Download Postman API collection JSON |
| `/api/doc` | `GET` | Interactive Swagger UI API documentation |
| `/api/openapi` | `GET` | OpenAPI 3.0 JSON specification |
| `/api/health` | `GET` | Database health status check |
| `/api/auth/register` | `POST` | User registration |
| `/api/auth/login` | `POST` | User login (returns JWT tokens) |
| `/api/auth/refresh` | `POST` | Refresh token rotation |
| `/api/auth/logout` | `POST` | Invalidate refresh token(s) |
| `/api/protected` | `GET` | Authenticated user resource example |
| `/api/admin` | `GET` | Admin-only resource example |

---

## 📁 File Storage Guidelines

- Storage files reside inside `src/storage/`.
- Public avatars are stored in `src/storage/app/public/avatars/` and served at `http://localhost:8000/storage/avatars/<filename>`.
- System log files are automatically appended to `src/storage/log/log.log`.
