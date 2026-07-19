#!/bin/bash

# finish.sh - Production Build & Deployment Script
# Backend: Hono Base Postgres (Hono API + PostgreSQL + Bun)
# Usage: ./finish.sh

# Exit immediately if a command exits with a non-zero status
set -e

echo "🚀 Starting BE Production Deployment..."

# 1. Pull latest changes (Uncomment if you want to pull from git automatically)
# echo "Pulling latest changes from git..."
# git pull

# 2. Set Package Manager
PKG_MANAGER="bun"
INSTALL_CMD="bun install"

GENERATE_SCHEMA_TABLE_CMD="bun run db:generate"
MIGRATE_SCHEMA_CMD="bun run db:push"

BUILD_CMD="bun run build"

echo "Using package manager: $PKG_MANAGER"

# 3. Install Dependencies
echo "Installing dependencies..."
$INSTALL_CMD

echo "Dependencies installed."

# 4. Generate & Migrate Database Schema
echo "Generating database schema..."
$GENERATE_SCHEMA_TABLE_CMD

echo "Pushing database schema changes..."
$MIGRATE_SCHEMA_CMD

echo "Database schema up to date."

# 5. Build Project (TypeScript -> dist/)
echo "Building project..."
$BUILD_CMD

# 6. Generate Postman Collection
echo "Generating Postman collection..."
bun run collection

# 7. Clean Cache
echo "Cleaning unnecessary caches..."
# rm -rf node_modules/.cache

echo "Cache cleaned."

# 8. Restart All PM2 / Bun Processes
if command -v pm2 &> /dev/null; then
    echo "Restarting all PM2 processes..."
    pm2 restart all
    echo "All PM2 processes restarted."
else
    echo "PM2 not found. Skipping restart."
    echo "You can start the app manually with: bun run dev or pm2 start ecosystem.config.cjs"
fi

echo "✅ BE Deployment finished successfully!"