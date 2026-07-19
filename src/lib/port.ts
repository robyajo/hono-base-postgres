import { execSync } from "node:child_process";

/**
 * Checks if a port is in use across Windows, Linux, and macOS.
 * If occupied, displays suggested manual kill commands and exits process (Next.js behavior).
 */
export function checkPortOccupied(port: number): void {
  const isWin = process.platform === "win32";
  const foundPids: string[] = [];

  try {
    if (isWin) {
      const output = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf-8" });
      const lines = output.split("\n").filter(Boolean);
      for (const line of lines) {
        if (line.includes("LISTENING") || line.includes(`:${port}`)) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== "0" && !foundPids.includes(pid)) {
            foundPids.push(pid);
          }
        }
      }
    } else {
      const output = execSync(`lsof -ti:${port}`, { encoding: "utf-8" });
      const pids = output.split("\n").map((s) => s.trim()).filter(Boolean);
      foundPids.push(...pids);
    }
  } catch {
    // Port is free
  }

  if (foundPids.length > 0) {
    console.error(`\n❌ Error: Port ${port} is already in use by PID(s): ${foundPids.join(", ")}`);
    console.error(`💡 Suggested commands to kill the process on port ${port}:`);
    if (isWin) {
      console.error(`   • Windows (PowerShell):  Stop-Process -Id ${foundPids[0]} -Force`);
      console.error(`   • Windows (CMD):         taskkill /F /PID ${foundPids[0]}`);
      console.error(`   • Cross-platform:        npx kill-port ${port}\n`);
    } else {
      console.error(`   • Linux / macOS:         kill -9 ${foundPids.join(" ")}`);
      console.error(`   • Cross-platform:        npx kill-port ${port}\n`);
    }
    console.error(`Please stop the process or change the PORT variable in your .env file.\n`);
    process.exit(1);
  }
}
