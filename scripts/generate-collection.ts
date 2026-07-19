/**
 * generate-collection.ts
 *
 * Scan route source files langsung (tanpa import/apapun) untuk generate
 * Postman Collection v2.1 → collection-respon.json
 *
 * Cara pakai:
 *   npx tsx scripts/generate-collection.ts
 *   # atau
 *   npm run collection
 *
 * Script ini:
 *   1. Scan src/routes/index.ts → ambil mount prefix (api.route("/prefix", ...))
 *   2. Scan tiap route file → extract method, path, summary, description, middleware
 *   3. Generate Postman Collection v2.1 JSON
 *   4. Tulis ke collection-respon.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const ROUTES_DIR = path.join(ROOT, "src", "routes");
const INDEX_FILE = path.join(ROUTES_DIR, "index.ts");
const OUTPUT_FILE = path.resolve(ROOT, "collection-respon.json");

// Read BASE_URL from .env → always stays in sync with environment
function loadBaseUrl(): string {
  // 1. Try .env file
  const envPath = path.join(ROOT, ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    const match = envContent.match(/^BASE_URL\s*=\s*(.+)$/m);
    if (match) {
      const url = match[1].trim().replace(/\/+$/, "");
      return `${url}/api`;
    }
  }
  // 2. Fallback to process.env (injected by dotenv or shell)
  if (process.env.BASE_URL) {
    return `${process.env.BASE_URL.replace(/\/+$/, "")}/api`;
  }
  // 3. Final fallback
  return "http://localhost:8000/api";
}

const BASE_URL = loadBaseUrl();

// ── Types ──────────────────────────────────────────────────────────────────
interface RouteInfo {
  method: string;
  path: string;
  summary: string;
  description: string;
  auth: string; // "public" | "session" | "admin"
  requestBody?: string;
}

interface PostmanItem {
  name: string;
  request: {
    method: string;
    header: Array<{ key: string; value: string }>;
    url: {
      raw: string;
      host: string[];
      port?: string;
      path: string[];
      query?: Array<{ key: string; value: string; description?: string }>;
    };
    description?: string;
  };
  response: any[];
}

interface PostmanCollection {
  info: {
    _postman_id: string;
    name: string;
    description: string;
    schema: string;
  };
  item: PostmanItem[];
  variable: Array<{ key: string; value: string; type: string }>;
}

// ── Parse mount prefixes from index.ts ─────────────────────────────────────
function parseMountPrefixes(indexContent: string): Record<string, string> {
  // Pattern: api.route("/prefix", routeHandler); // comment
  const prefixMap: Record<string, string> = {};
  const routeRegex = /api\.route\(\s*"([^"]+)"\s*,\s*(\w+)\s*\)/g;

  let match;
  while ((match = routeRegex.exec(indexContent)) !== null) {
    const prefix = match[1]; // e.g. "/auth"
    const varName = match[2]; // e.g. "authRoute"
    prefixMap[varName] = prefix;
  }

  return prefixMap;
}

// ── Parse direct routes from index.ts (api.get, api.post, etc.) ────────────
function parseDirectRoutesFromIndex(indexContent: string): RouteInfo[] {
  const routes: RouteInfo[] = [];

  // Find api.get/post/put/delete with describeRoute
  const routePattern = /api\.(get|post|put|delete|patch)\(\s*"([^"]+)"\s*,/g;
  let match;

  while ((match = routePattern.exec(indexContent)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2];

    // Extract summary/description from describeRoute nearby
    const afterMatch = indexContent.substring(match.index, match.index + 1500);
    const summary = extractString(afterMatch, "summary");
    const description = extractString(afterMatch, "description");

    // Check auth
    const beforeMatch = indexContent.substring(
      Math.max(0, match.index - 500),
      match.index,
    );
    let auth = "public";
    if (beforeMatch.includes("ensureAdmin") || afterMatch.includes("ensureAdmin")) {
      auth = "admin";
    } else if (beforeMatch.includes("sessionMiddleware") || afterMatch.includes("sessionMiddleware")) {
      auth = "session";
    }

    // Skip internal routes (openapi, doc, health, etc. in index)
    if (routePath === "/openapi" || routePath === "/doc") continue;

    routes.push({
      method,
      path: routePath,
      summary: summary || `${method} ${routePath}`,
      description: description || "",
      auth,
    });
  }

  return routes;
}

// ── Parse a single route file ──────────────────────────────────────────────
function parseRouteFile(
  filePath: string,
  mountPrefix: string,
): RouteInfo[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const routes: RouteInfo[] = [];

  // Detect file-level middleware
  let fileAuth = "public";
  if (
    content.includes('app.use("*", sessionMiddleware)') ||
    content.includes('app.use("/*", sessionMiddleware)')
  ) {
    fileAuth = "session";
  }
  if (
    content.includes('app.use("/*", ensureAdmin)') ||
    content.includes('app.use("*", ensureAdmin)')
  ) {
    fileAuth = "admin";
  }

  // Pattern 1: Routes with describeRoute({ summary: "..." })
  // We need to find: app.get(  "/path",  describeRoute({ ... }),
  // The path is the first string argument after app.method(
  const methodPattern =
    /(?:app|redisMonitor|systemMonitor)\.(get|post|put|delete|patch)\(\s*\n?\s*"([^"]+)"/g;

  let match;
  while ((match = methodPattern.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2];

    // Skip catch-all routes
    if (routePath === "/*" || routePath === "/") continue;

    // Extract summary/description from describeRoute nearby
    const afterMatch = content.substring(match.index, match.index + 2000);
    const summary = extractString(afterMatch, "summary");
    const description = extractString(afterMatch, "description");

    // Detect route-level auth
    let auth = fileAuth;
    const routeBlock = content.substring(
      match.index,
      Math.min(content.length, match.index + 500),
    );
    if (routeBlock.includes("ensureAdmin")) {
      auth = "admin";
    } else if (routeBlock.includes("adminMiddleware")) {
      auth = "admin";
    }

    // Extract request body schema if validator is used
    let requestBody: string | undefined;
    if (afterMatch.includes('validator("json"')) {
      requestBody = "application/json";
    } else if (afterMatch.includes("multipart") || afterMatch.includes("parseBody")) {
      requestBody = "multipart/form-data";
    }

    // Build summary from comment if no describeRoute summary found
    let finalSummary = summary;
    if (!finalSummary) {
      // Try to extract from comment pattern: // ─── [METHOD] /path ── Description ───
      const beforeMatch = content.substring(
        Math.max(0, match.index - 300),
        match.index,
      );
      const commentMatch = beforeMatch.match(
        /\[([A-Z]+)\]\s+(\S+)\s+[─]+\s*(.+?)\s*─/,
      );
      if (commentMatch) {
        finalSummary = commentMatch[3].trim();
      }
    }

    const fullPath = mountPrefix + routePath;

    routes.push({
      method,
      path: fullPath,
      summary: finalSummary || `${method} ${fullPath}`,
      description: description || "",
      auth,
      requestBody,
    });
  }

  // Pattern 2: Routes without describeRoute (only comments)
  // redisMonitor and systemMonitor routes use comment-based docs
  if (routes.length === 0) {
    const commentPattern =
      /\/\/\s*\[([A-Z]+)\]\s+(\/\S+)\s+[─]+\s*(.+?)\s*─/g;
    const instancePattern =
      /(?:redisMonitor|systemMonitor)\.(get|post|put|delete|patch)\(\s*"([^"]+)"/g;

    // Collect comment-based routes first
    const commentRoutes: Record<string, string> = {};
    let cm;
    while ((cm = commentPattern.exec(content)) !== null) {
      const key = `${cm[1].toUpperCase()}:${cm[2]}`;
      commentRoutes[key] = cm[3].trim();
    }

    // Collect actual routes
    let rm;
    while ((rm = instancePattern.exec(content)) !== null) {
      const method = rm[1].toUpperCase();
      const routePath = rm[2];
      const key = `${method}:${routePath}`;
      const summary = commentRoutes[key] || `${method} ${mountPrefix}${routePath}`;

      routes.push({
        method,
        path: mountPrefix + routePath,
        summary,
        description: "",
        auth: fileAuth,
      });
    }
  }

  return routes;
}

// ── Extract string value from describeRoute({ ... }) ───────────────────────
function extractString(text: string, key: string): string {
  // Match patterns like: summary: "some text" or summary:\n  "some text"
  // Also match: description:\n  "multi-line text"
  const regex = new RegExp(
    `${key}\\s*:\\s*(?:"([^"]*)")|(?:\\n\\s*"([^"]*)")`,
    "i",
  );
  const match = text.match(regex);
  if (match) {
    return match[1] || match[2] || "";
  }
  return "";
}

// ── Convert routes to Postman Collection ────────────────────────────────────
function generateCollection(routes: RouteInfo[]): PostmanCollection {
  const parsedUrl = new URL(BASE_URL);
  const host = parsedUrl.host.split(":");
  const port = parsedUrl.port || undefined;

  // Group by first path segment for folder organization
  const grouped: Record<string, RouteInfo[]> = {};
  for (const route of routes) {
    const segments = route.path.replace(/^\//, "").split("/");
    const folder = segments[0] || "root";
    if (!grouped[folder]) grouped[folder] = [];
    grouped[folder].push(route);
  }

  const items: PostmanItem[] = [];

  for (const [, folderRoutes] of Object.entries(grouped)) {
    for (const route of folderRoutes) {
      const pathSegments = route.path.replace(/^\//, "").split("/");
      const postmanPath = pathSegments.map((s) =>
        s.startsWith(":") ? s.substring(1) : s,
      );

      const authLabel =
        route.auth === "admin"
          ? " [Admin]"
          : route.auth === "session"
            ? " [Auth]"
            : "";

      let rawUrl = `${BASE_URL}${route.path}`;
      let queryParams: PostmanItem["request"]["url"]["query"] | undefined;

      // Add placeholder query params for known patterns
      if (route.path.includes("redis-monitor/keys") && route.method === "GET") {
        queryParams = [
          { key: "pattern", value: "*", description: "Redis key pattern" },
          { key: "count", value: "100", description: "Max keys to return" },
          { key: "cursor", value: "0", description: "SCAN cursor" },
        ];
        rawUrl += "?pattern=*&count=100&cursor=0";
      }

      const headers: Array<{ key: string; value: string }> = [
        { key: "Content-Type", value: "application/json" },
        { key: "Accept", value: "application/json" },
      ];

      if (route.auth !== "public") {
        headers.push({
          key: "Authorization",
          value: "Bearer {{jwt_token}}",
        });
      }

      const description = route.description
        ? `${route.description}\n\nAuth: ${route.auth === "admin" ? "Admin only" : route.auth === "session" ? "Requires login (Bearer token)" : "Public"}`
        : `Auth: ${route.auth === "admin" ? "Admin only" : route.auth === "session" ? "Requires login (Bearer token)" : "Public"}`;

      items.push({
        name: `[${route.method}] ${route.summary}${authLabel}`,
        request: {
          method: route.method,
          header: headers,
          url: {
            raw: rawUrl,
            host,
            ...(port ? { port } : {}),
            path: postmanPath,
            ...(queryParams ? { query: queryParams } : {}),
          },
          description,
        },
        response: [],
      });
    }
  }

  // Sort: group by method, then by path
  items.sort((a, b) => {
    const methodOrder = ["GET", "POST", "PUT", "DELETE", "PATCH"];
    const aIdx = methodOrder.indexOf(a.request.method);
    const bIdx = methodOrder.indexOf(b.request.method);
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.request.url.raw.localeCompare(b.request.url.raw);
  });

  return {
    info: {
      _postman_id: crypto.randomUUID(),
      name: "Finkita API Collection",
      description:
        "Auto-generated Postman collection dari route source files.\nJalankan: npm run collection",
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: items,
    variable: [
      { key: "base_url", value: BASE_URL, type: "string" },
      { key: "jwt_token", value: "", type: "string" },
    ],
  };
}

// ── Generate once ───────────────────────────────────────────────────────────
function generate(): number {
  console.log("🔍 Scanning route files...\n");

  if (!fs.existsSync(INDEX_FILE)) {
    console.error("❌ routes/index.ts not found at:", INDEX_FILE);
    process.exit(1);
  }

  const indexContent = fs.readFileSync(INDEX_FILE, "utf-8");
  const prefixMap = parseMountPrefixes(indexContent);
  const directRoutes = parseDirectRoutesFromIndex(indexContent);

  console.log("📂 Mount prefixes:");
  for (const [varName, prefix] of Object.entries(prefixMap)) {
    console.log(`   ${varName} → /api${prefix}`);
  }

  // Scan each route file
  const allRoutes: RouteInfo[] = [];
  const files = fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".ts") && f !== "index.ts");

  for (const file of files) {
    const filePath = path.join(ROUTES_DIR, file);
    // Find mount prefix for this file's variable name
    const importRegex = new RegExp(
      `import\\s+(\\w+)\\s+from\\s+["']\\.\\/${file.replace(".ts", "")}\\.js["']`,
    );
    const importMatch = indexContent.match(importRegex);
    const varName = importMatch?.[1];

    const mountPrefix = varName && prefixMap[varName] ? prefixMap[varName] : "";

    const routes = parseRouteFile(filePath, mountPrefix);
    if (routes.length > 0) {
      console.log(`   📄 ${file}: ${routes.length} route(s)`);
      allRoutes.push(...routes);
    } else {
      console.log(`   ⚠️  ${file}: 0 route(s) (no describeRoute or comment patterns found)`);
    }
  }

  // Add direct routes from index.ts
  if (directRoutes.length > 0) {
    console.log(`   📄 index.ts: ${directRoutes.length} direct route(s)`);
    allRoutes.push(...directRoutes);
  }

  console.log(`\n📊 Total routes found: ${allRoutes.length}`);

  if (allRoutes.length === 0) {
    console.error("❌ No routes found. Check that route files use describeRoute() or comment patterns.");
    process.exit(1);
  }

  // Re-read BASE_URL in case .env changed (watch mode)
  const currentBaseUrl = loadBaseUrl();
  const collection = generateCollection(allRoutes);

  // Override base_url variable with current .env value
  const urlVar = collection.variable.find((v) => v.key === "base_url");
  if (urlVar) urlVar.value = currentBaseUrl;

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2), "utf-8");

  console.log(`\n✅ Postman collection saved to: ${OUTPUT_FILE}`);
  console.log(`   Base URL: ${currentBaseUrl}`);
  console.log(`   Items: ${collection.item.length}`);
  return collection.item.length;
}

// ── Main ───────────────────────────────────────────────────────────────────
function main() {
  const isWatch = process.argv.includes("--watch");

  generate();

  if (!isWatch) {
    console.log(`\n💡 Import ke Postman: File → Import → Upload Files → collection-respon.json`);
    console.log(`💡 Watch mode: npx tsx scripts/generate-collection.ts --watch`);
    return;
  }

  // ── Watch mode: re-generate on file changes ──────────────────────────────
  console.log("\n👀 Watching for changes... (Ctrl+C to stop)\n");

  const watchPaths = [
    { target: ROUTES_DIR, recursive: true, label: "routes/" },
    { target: path.join(ROOT, ".env"), recursive: false, label: ".env" },
  ];

  let debounceTimer: ReturnType<typeof setTimeout>;
  const regenerate = (reason: string) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`\n🔄 Change detected: ${reason}`);
      generate();
    }, 300);
  };

  for (const { target, recursive, label } of watchPaths) {
    if (fs.existsSync(target)) {
      fs.watch(target, { recursive }, (_event, filename) => {
        if (filename) regenerate(`${label}/${filename}`);
      });
    }
  }
}

main();
