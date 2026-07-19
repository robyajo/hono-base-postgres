#!/bin/bash

# Clear all bun caches
echo "🧹 Clearing bun caches..."
bun cache --clear
git checkout -- package-lock.json
git checkout -- finish.sh

echo "✅ Optimization complete!"