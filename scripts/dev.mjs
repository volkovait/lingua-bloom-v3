import { spawn } from "node:child_process";

const processes = [
  spawn("pnpm", ["run", "dev:web"], {
    stdio: "inherit",
    env: process.env
  }),
  spawn("pnpm", ["run", "dev:inngest"], {
    stdio: "inherit",
    env: process.env
  })
];

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
