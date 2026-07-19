# 📘 Developer Manual Book & Architecture Guide

Welcome to the **Hono Base Postgres** project manual! This guide provides full context, setup instructions, database management rules, and API design guidelines for developers working on this project.

---

## 👨‍💻 Project Developer & Repository

- **Developer / Author**: **Roby** ([@robyajo](https://github.com/robyajo))
- **GitHub Repository**: [https://github.com/robyajo/hono-base-postgres](https://github.com/robyajo/hono-base-postgres)
- **License**: MIT

---

## 🛠️ Technology Stack

| Layer | Technology | Description |
|---|---|---|
| **Runtime & Package Manager** | **Bun** (`v1.3+`) | Ultra-fast JavaScript/TypeScript engine & package manager |
| **Web Framework** | **Hono** (`v4.x`) | Lightweight web framework optimized for Bun |
| **Database** | **PostgreSQL** (`v14+`) | Relational database accessed via `postgres` (`postgres-js`) client |
| **ORM** | **Drizzle ORM** | Type-safe SQL schema definition & relational query builder |
| **Authentication** | **Better Auth** & **JWT** | Hybrid authentication (Better Auth sessions + JWT Bearer rotation) |
| **Background Queue** | **BullMQ & Redis** *(Optional)* | Redis-backed task queue with automatic fallback when disabled |
| **Real-time WebSockets** | **Hono + Bun WS** *(Optional)* | High-performance native WebSocket server on path `/ws` |
| **Process Manager** | **PM2** | Production process management using native Bun interpreter |
| **Containerization** | **Docker & Docker Compose** | Redis container service on port `6380:6379` |
| **API Documentation** | **Swagger UI** & **OpenAPI** | Interactive docs at `/api/doc` & JSON spec at `/api/openapi` |

---

## 📁 Directory Structure

```
hono-base-postgres/
├── .env                  # Active environment variables
├── .env.example          # Environment template
├── docker-compose.yml    # Docker services (Redis on port 6380:6379)
├── ecosystem.config.cjs  # PM2 production configuration with Bun interpreter
├── drizzle.config.ts     # Drizzle Kit configuration (PostgreSQL dialect)
├── package.json          # Dependencies & scripts
├── finish.sh             # Production build & schema deployment script
├── gitdone.sh            # Git cleanup script
├── manual-book-dev.md    # Developer manual documentation
└── src/
    ├── index.ts          # Main Bun server entry point & middleware mounting
    ├── auth.ts           # Better Auth instance & social OAuth provider setup
    ├── config/
    │   └── drizzle.ts    # Zod environment variable validation & config export
    ├── db/
    │   ├── index.ts      # Drizzle database client & combined schema export
    │   ├── relations.ts  # Drizzle v1.0 relational mappings (defineRelations)
    │   ├── seed.ts       # Seeding script for Admin, User, & Social Media profiles
    │   ├── reset.ts      # PostgreSQL database reset & migration script
    │   └── schema/
    │       ├── index.ts        # Schema re-export entry point
    │       ├── user.ts         # User, session, account, verification, refreshToken tables
    │       └── sosial-media.ts # Social media links table (sosial_media)
    ├── html/
    │   ├── index.html        # Glassmorphic developer landing dashboard
    │   └── manual-book.html  # Interactive HTML Markdown reader template
    ├── lib/
    │   ├── crypto.ts     # Bun native password hashing (`Bun.password`) & credential sync
    │   ├── avatar.ts     # Local avatar downloader utility
    │   ├── logger.ts     # Custom file logger writing to src/storage/log/log.log
    │   ├── port.ts       # Next.js-style cross-platform port collision detection
    │   ├── queue.ts      # Optional BullMQ Redis task queue & fallback handler
    │   ├── server.ts     # Graceful server shutdown & storage directory setup
    │   └── websocket.ts  # Optional Hono + Bun WebSocket server implementation
    ├── middleware/
    │   ├── auth.ts          # Hybrid session & JWT Bearer authentication middleware
    │   ├── ensureAdmin.ts   # Admin role guard middleware
    │   ├── ensureUser.ts    # User role guard middleware
    │   ├── errorHandler.ts  # Global exception handler
    │   └── requestLogger.ts # HTTP request logger
    ├── routes/
    │   ├── index.ts      # Main API router (/api/health, /api/doc, /api/openapi, etc.)
    │   └── auth.ts       # Auth endpoints (/register, /login, /refresh, /me, /update-profile, /update-password)
    └── storage/
        ├── app/public/avatars/ # Statically served user avatar images (/storage/avatars/*)
        └── log/                # Application logs (src/storage/log/log.log)
```

---

## ⚙️ Environment Configuration (`.env`)

```env
PORT=8000
BASE_URL=http://localhost:8000
APP_NAME="Hono Base Postgres"
APP_ENV=development

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

# Optional Redis Configuration (BullMQ Queue & Docker)
REDIS_ENABLED=false
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_URL=redis://127.0.0.1:6379

# Optional WebSocket Configuration (Hono + Bun WS)
WS_ENABLED=false
WS_PATH=/ws
```

---

## 📡 Real-time WebSocket Setup & Usage Guide

WebSockets are built into Bun and Hono (`createBunWebSocket`). They are disabled by default (`WS_ENABLED=false`).

### 1. Enabling WebSockets
Set environment variables in `.env`:
```env
WS_ENABLED=true
WS_PATH=/ws
```

### 2. Client-Side JavaScript Usage Example
```javascript
// Connect to WebSocket server
const ws = new WebSocket("ws://localhost:8000/ws");

ws.onopen = () => {
  console.log("Connected to Hono + Bun WebSocket!");
  ws.send(JSON.stringify({ type: "ping", payload: "Hello Server" }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("Message from server:", data);
};

ws.onclose = () => {
  console.log("WebSocket connection closed.");
};
```

### 3. Production Nginx Reverse Proxy Setup
For production deployment over HTTPS/WSS (`wss://your-domain.com/ws`), configure Nginx to proxy WebSocket headers:

```nginx
location /ws {
    proxy_pass http://127.0.0.1:8000/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

---

## 🐳 Docker & Redis Queue Setup

Redis is available for background processing via Docker Compose:

```yaml
# docker-compose.yml
services:
    redis:
        image: redis:7-alpine
        container_name: kilex-redis
        ports:
            - '6380:6379'
        volumes:
            - redis-data:/data
        restart: unless-stopped
        command: redis-server --appendonly yes
```

### Starting Redis Container:
```bash
# Start Redis container in detached mode
docker compose up -d redis

# Update .env to enable Redis:
# REDIS_ENABLED=true
# REDIS_PORT=6380
```

---

## 🔒 Environment Access Control (`APP_ENV`)

| Endpoint | `APP_ENV=development` | `APP_ENV=production` |
|---|---|---|
| `GET /` | Interactive Developer Portal (`src/html/index.html`) | JSON API Status `{ name, status: "online" }` |
| `GET /manual-book` | Markdown Reader (`src/html/manual-book.html`) | `403 Forbidden` |
| `GET /download/collection` | Download Postman Collection JSON | `403 Forbidden` |
| `GET /download/manual-book` | Download raw `manual-book-dev.md` | `403 Forbidden` |
| `GET /api/doc` & `/api/openapi` | Swagger UI & OpenAPI JSON Spec | `403 Forbidden` |

---

## 🚀 Development & Database Commands

```bash
# Install dependencies
bun install

# Start development server with hot-reload
bun run dev

# Type check codebase (0 errors)
bun x tsc --noEmit

# Build production bundle
bun run build

# Generate Drizzle migration files
bun run db:generate

# Push schema changes directly to PostgreSQL
bun run db:push

# Reset database schema and run migrations & seed
bun run db:reset -- --seed

# Seed Admin, User, & Social Media profiles
bun run db:seed

# Launch Drizzle Studio (Database GUI)
bun run db:studio

# PM2 Process Management
pm2 start ecosystem.config.cjs
```

---

## 🔐 Authentication Architecture

The application supports **hybrid authentication**:

1. **JWT Bearer Token Authentication**:
   - `POST /api/auth/login` returns an `accessToken` (15 min) and a `refreshToken` (7 days).
   - Header: `Authorization: Bearer <accessToken>`.
   - `POST /api/auth/refresh` rotates refresh tokens and yields a new `accessToken`.

2. **Better Auth Session Cookie Authentication**:
   - Cookie-based authentication for web clients & social OAuth endpoints (`/api/auth/signin/google`, etc.).
   - `sessionMiddleware` validates both Bearer tokens and cookies seamlessly, setting `c.get("user")` and `c.get("session")`.

---

## 👥 Seeded User Accounts & Social Media

| Account | Email | Password | Role | Social Media Profiles |
|---|---|---|---|---|
| 👑 **Admin** | `admin@gmail.com` | `Password123` | `ADMIN` | GitHub, LinkedIn, Instagram |
| 👤 **User** | `user@gmail.com` | `Password123` | `USER` | Instagram, TikTok |

---

## 📁 File Storage Guidelines

- All files reside in `src/storage/`.
- Public user avatars are stored in `src/storage/app/public/avatars/` and served statically at `/storage/avatars/<filename>`.
- Log entries are stored in `src/storage/log/log.log` (application logs) and `src/storage/log/pm2-*.log` (PM2 logs).
