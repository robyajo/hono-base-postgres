<div align="center">

# 🚀 Hono Base Postgres

**Production-Ready, High-Performance RESTful API & Real-Time Boilerplate**  
*Powered by Bun, Hono v4, PostgreSQL, Drizzle ORM, Better Auth & Hybrid JWT.*

[![Bun](https://img.shields.io/badge/Bun-v1.3+-black?style=for-the-badge&logo=bun)](https://bun.sh)
[![Hono](https://img.shields.io/badge/Hono-v4-orange?style=for-the-badge&logo=hono)](https://hono.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v14+-blue?style=for-the-badge&logo=postgresql)](https://www.postgresql.org)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-v1.0-green?style=for-the-badge&logo=drizzle)](https://orm.drizzle.team)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

[Developer Portal](http://localhost:8000/) • [Interactive Manual Book](http://localhost:8000/manual-book) • [Swagger UI](http://localhost:8000/api/doc) • [GitHub Repo](https://github.com/robyajo/hono-base-postgres)

</div>

---

## 🌟 Highlights & Key Features

- **⚡ Lightning Fast Runtime**: Built on top of **Bun v1.3+** and **Hono v4** web framework.
- **🐘 Type-Safe PostgreSQL ORM**: **Drizzle ORM** with relational schema mapping (`defineRelations`).
- **🔐 Hybrid Authentication**:
  - **JWT Bearer Tokens** with short-lived `accessToken` (15 min) & auto-rotating `refreshToken` (7 days).
  - **Better Auth** session cookies and social OAuth support (Google Sign-In).
  - Native Google Credential Manager integration for Android/iOS apps (`/api/auth/google-mobile`).
- **👤 User Management & Profile System**:
  - `/api/auth/me` — Authenticated profile retriever with social media links (`sosial_media` table).
  - `/api/auth/update-profile` — Update display name and download/save avatars to local storage.
  - `/api/auth/update-password` — Password change endpoint requiring old password verification.
- **📡 Real-time WebSockets (Optional)**: Built-in native Hono + Bun WebSocket support (`WS_ENABLED=true`).
- **🔄 Redis & BullMQ Queue (Optional)**: Optional background job worker with safe fallback execution when Redis is disabled.
- **🛡️ Production Ready**:
  - Multi-OS port collision protection (suggests `Stop-Process` on Windows, `kill-port`, etc.).
  - Environment guards (`APP_ENV=development` vs `production`).
  - PM2 configuration with native Bun interpreter (`ecosystem.config.cjs`).
  - Production-ready **Nginx** proxy configuration (`nginx.conf`).

---

## 🛠️ Tech Stack Overview

| Category | Technology | Purpose |
|---|---|---|
| **Engine** | [Bun](https://bun.sh) `v1.3+` | Runtime, bundler, and package manager |
| **Framework** | [Hono](https://hono.dev) `v4.x` | Ultra-fast, lightweight web framework |
| **Database** | [PostgreSQL](https://www.postgresql.org) `v14+` | Relational database via `postgres-js` |
| **ORM** | [Drizzle ORM](https://orm.drizzle.team) | Schema migration and query builder |
| **Auth** | [Better Auth](https://www.better-auth.com) & JWT | Cookie sessions and Bearer token rotation |
| **Realtime** | [Bun WebSocket](https://hono.dev/helpers/websocket) | Native WebSockets on `/ws` path |
| **Background Queue** | [BullMQ](https://docs.bullmq.io) & [Redis](https://redis.io) | Asynchronous task processing |
| **API Docs** | [Swagger UI](https://swagger.io) & OpenAPI 3.0 | Interactive API documentation |

---

## 📁 Directory Architecture

```
hono-base-postgres/
├── .env                  # Active environment variables
├── .env.example          # Environment template
├── docker-compose.yml    # Docker services (Redis container on port 6380:6379)
├── ecosystem.config.cjs  # PM2 production configuration with Bun interpreter
├── nginx.conf            # Production Nginx reverse proxy configuration
├── drizzle.config.ts     # Drizzle Kit configuration (PostgreSQL dialect)
├── manual-book-dev.md    # Full developer manual documentation
└── src/
    ├── index.ts          # Server entry point & static asset serving
    ├── auth.ts           # Better Auth instance & social OAuth provider setup
    ├── config/
    │   └── drizzle.ts    # Zod environment variable validation & config export
    ├── db/
    │   ├── index.ts      # Drizzle database client & combined schema export
    │   ├── relations.ts  # Drizzle v1.0 relational mappings (defineRelations)
    │   ├── seed.ts       # Seeding script for Admin, User, & Social Media profiles
    │   ├── reset.ts      # PostgreSQL database reset & migration script
    │   └── schema/
    │       ├── user.ts         # User, session, account, verification, refreshToken tables
    │       └── sosial-media.ts # Social media links table (sosial_media)
    ├── html/
    │   ├── index.html        # Glassmorphic developer landing portal
    │   └── manual-book.html  # Interactive HTML Markdown reader template
    ├── lib/
    │   ├── crypto.ts     # Bun native password hashing & credential sync
    │   ├── avatar.ts     # Local avatar downloader utility
    │   ├── logger.ts     # Custom file logger writing to src/storage/log/log.log
    │   ├── port.ts       # Next.js-style cross-platform port collision detection
    │   ├── queue.ts      # Optional BullMQ Redis task queue & fallback handler
    │   ├── server.ts     # Graceful server shutdown & storage directory setup
    │   └── websocket.ts  # Optional Hono + Bun WebSocket server
    ├── middleware/
    │   ├── auth.ts          # Hybrid session & JWT Bearer authentication middleware
    │   ├── ensureAdmin.ts   # Admin role guard middleware
    │   └── errorHandler.ts  # Global exception handler
    └── routes/
        ├── index.ts      # Main API router (/api/health, /api/doc, /api/openapi, etc.)
        └── auth.ts       # Auth endpoints (/register, /login, /refresh, /me, /update-profile, /update-password)
```

---

## ⚡ Quick Start & Installation

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/robyajo/hono-base-postgres.git
cd hono-base-postgres
bun install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your PostgreSQL database credentials:

```bash
cp .env.example .env
```

```env
PORT=8000
BASE_URL=http://localhost:8000
APP_NAME="Hono Base Postgres"
APP_ENV=development

# PostgreSQL Connection
DB_USER=postgres
DB_PASSWORD=12341234
DB_NAME=hono_base
DB_HOST=127.0.0.1
DB_PORT=5432

# JWT & Better Auth Security
JWT_SECRET=super_secret_jwt_key_change_in_production_32_chars
BETTER_AUTH_SECRET=your_better_auth_secret_minimum_32_characters_long
```

### 3. Setup Database Schema & Seed Data
```bash
# Push schema directly to PostgreSQL database
bun run db:push

# Reset database schema and seed default Admin, User, & Social Media profiles
bun run db:reset -- --seed
```

### 4. Start Development Server
```bash
bun run dev
```

Visit the Developer Portal in your browser:
- **Dashboard**: [http://localhost:8000/](http://localhost:8000/)
- **Interactive Manual Book**: [http://localhost:8000/manual-book](http://localhost:8000/manual-book)
- **Swagger UI**: [http://localhost:8000/api/doc](http://localhost:8000/api/doc)

---

## 🔑 Default Seeded Accounts

| Account | Email | Password | Role | Social Media Profiles |
|---|---|---|---|---|
| 👑 **Admin** | `admin@gmail.com` | `Password123` | `ADMIN` | GitHub, LinkedIn, Instagram |
| 👤 **User** | `user@gmail.com` | `Password123` | `USER` | Instagram, TikTok |

---

## 🚀 Production Deployment Guide

```bash
# 1. Build TypeScript and copy HTML assets
bun run build

# 2. Start PM2 Process Manager with Bun interpreter
pm2 start ecosystem.config.cjs

# 3. Reload Nginx configuration
sudo nginx -t && sudo systemctl reload nginx
```

---

## 👨‍💻 Author & Developer Information

- **Developer / Author**: **Roby** ([@robyajo](https://github.com/robyajo))
- **GitHub Repository**: [https://github.com/robyajo/hono-base-postgres](https://github.com/robyajo/hono-base-postgres)
- **License**: MIT
