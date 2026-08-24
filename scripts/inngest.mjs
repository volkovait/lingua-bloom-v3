import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const packageDirectory = dirname(require.resolve("inngest-cli/package.json"));
const executable = join(
  packageDirectory,
  "bin",
  process.platform === "win32" ? "inngest.exe" : "inngest"
);
const child = spawn(executable, process.argv.slice(2), {
  stdio: "inherit",
  env: process.env
});

child.once("error", (error) => {
  console.error("Inngest CLI failed to start", error);
  process.exit(1);
});
child.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

process.once("SIGINT", () => child.kill("SIGINT"));
process.once("SIGTERM", () => child.kill("SIGTERM"));
