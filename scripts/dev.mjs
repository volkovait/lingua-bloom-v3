import { spawn } from "node:child_process";
import { createServer } from "node:net";

const requestedWebPort = Number(process.env.PORT ?? "3000");
const webPort = await firstAvailablePort(requestedWebPort);
const childEnvironment = {
  ...process.env,
  PORT: String(webPort),
  NODE_USE_SYSTEM_CA: process.env.NODE_USE_SYSTEM_CA ?? "1"
};

const processes = [
  spawn("pnpm", ["run", "dev:web"], {
    stdio: "inherit",
    env: childEnvironment
  }),
  spawn(
    "node",
    ["scripts/inngest.mjs", "dev", "-u", `http://localhost:${String(webPort)}/api/inngest`],
    {
      stdio: "inherit",
      env: childEnvironment
    }
  )
];

async function firstAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await portIsAvailable(port)) return port;
  }
  throw new Error(`No available web port in range ${String(startPort)}-${String(startPort + 19)}`);
}

function portIsAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
  });
}

let shuttingDown = false;

function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of processes) {
    if (!child.killed) child.kill(signal);
  }

  const forceExit = globalThis.setTimeout(() => {
    for (const child of processes) {
      if (!child.killed) child.kill("SIGKILL");
    }
    process.exit(exitCode);
  }, 5_000);
  forceExit.unref();

  Promise.all(processes.map((child) => new Promise((resolve) => child.once("exit", resolve)))).then(
    () => process.exit(exitCode)
  );
}

for (const child of processes) {
  child.once("error", (error) => {
    console.error("Local development service failed to start", error);
    shutdown("SIGTERM", 1);
  });
  child.once("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`Local development service stopped (${signal ?? `exit ${String(code)}`})`);
    shutdown("SIGTERM", code ?? 1);
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
