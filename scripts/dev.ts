import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dev } from "astro";

// Wrangler needs an assets directory before the first static build.
await mkdir("dist", { recursive: true });
const demos = spawn("pnpm", ["demos"], { stdio: "inherit" });
const result = await new Promise<number | null>((resolve) => demos.once("exit", resolve));
if (result !== 0) process.exit(result ?? 1);

// Own both lifecycles explicitly. Astro's CLI can detach in agent environments.
const worker = spawn("pnpm", ["exec", "wrangler", "dev", "--ip", "127.0.0.1", "--port", "8787"], {
  stdio: "inherit",
});
const site = await dev({ server: { host: "127.0.0.1", port: 4321 } }).catch((error) => {
  worker.kill("SIGTERM");
  throw error;
});
console.log(`Microworld: http://127.0.0.1:${site.address.port}`);
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  worker.kill("SIGTERM");
  await site.stop();
  process.exitCode = code;
}
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
worker.once("error", (error) => {
  console.error(error.message);
  void stop(1);
});
worker.once("exit", (code) => {
  if (!stopping) void stop(code ?? 1);
});
