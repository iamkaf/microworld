const VERSION = "1";
import { biomeColor } from "../palette.ts";
interface World {
  configuration: {
    terrain: { scale: number; seaLevel: number; roughness: number };
    placements: unknown[];
  };
  generatorVersion: string;
  seed: string;
  preset: string;
  window: { x: number; y: number; width: number; height: number };
  elevation: number[];
  biome: string[];
  objects: { x: number; y: number; width?: number; height?: number; object?: string }[];
  tiles: { x: number; y: number; tile: string }[];
}
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = get<HTMLCanvasElement>("world-canvas");
const ctx = canvas.getContext("2d")!;
const preset = get<HTMLSelectElement>("preset");
const seed = get<HTMLInputElement>("seed");
const layer = get<HTMLSelectElement>("layer");
const status = get("world-status");
const error = get("world-error");
const loading = get("map-loading");
const generate = get<HTMLButtonElement>("generate");
const raster = document.createElement("canvas");
let world: World | undefined;
let scale = 1,
  offsetX = 0,
  offsetY = 0,
  fitScale = 1;
let requestNumber = 0;
let requestController: AbortController | undefined;
function startRequest() {
  requestController?.abort();
  requestController = new AbortController();
  return { token: ++requestNumber, signal: requestController.signal };
}
const cache = new Map<string, World>();
function paintWorld(target: HTMLCanvasElement, data: World, view = "biome") {
  target.width = data.window.width;
  target.height = data.window.height;
  const context = target.getContext("2d")!;
  data.biome.forEach((biome, i) => {
    const elevation = data.elevation[i] ?? 0;
    if (view === "elevation") {
      const value = Math.round((elevation / 65535) * 220) + 20;
      context.fillStyle = `rgb(${value},${value},${value})`;
    } else context.fillStyle = biomeColor(biome);
    context.fillRect(i % data.window.width, Math.floor(i / data.window.width), 1, 1);
    if (view !== "elevation") {
      const shade = (elevation / 65535 - 0.5) * 0.23;
      context.fillStyle = shade > 0 ? `rgba(255,255,240,${shade})` : `rgba(15,30,25,${-shade})`;
      context.fillRect(i % data.window.width, Math.floor(i / data.window.width), 1, 1);
    }
  });
  if (view === "objects") {
    context.fillStyle = "#ffffff80";
    context.fillRect(0, 0, target.width, target.height);
  }
  if (view !== "elevation") {
    for (const object of data.objects ?? []) {
      context.fillStyle = view === "objects" ? "#444333" : "#3f6245";
      context.fillRect(
        object.x - data.window.x,
        object.y - data.window.y,
        object.width ?? 1,
        object.height ?? 1,
      );
    }
    for (const tile of data.tiles ?? []) {
      context.fillStyle = tile.tile.includes("wall") ? "#6f5b48" : "#baa77c";
      context.fillRect(tile.x - data.window.x, tile.y - data.window.y, 1, 1);
    }
  }
}
function draw() {
  const { width, height } = canvas.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#e7eadd";
  ctx.fillRect(0, 0, width, height);
  if (!world) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(raster, offsetX, offsetY, raster.width * scale, raster.height * scale);
}
function reset() {
  if (!world) return;
  fitScale = Math.max(
    canvas.clientWidth / world.window.width,
    canvas.clientHeight / world.window.height,
  );
  scale = fitScale;
  offsetX = (canvas.clientWidth - raster.width * scale) / 2;
  offsetY = (canvas.clientHeight - raster.height * scale) / 2;
  draw();
}
function show(data: World, source: string) {
  world = data;
  paintWorld(raster, data, layer.value);
  reset();
  get("map-title").textContent = preset.options[preset.selectedIndex]?.text ?? data.preset;
  get("map-seed").textContent = data.seed;
  get<HTMLInputElement>("terrain-scale").value = String(data.configuration.terrain.scale);
  get<HTMLInputElement>("sea-level").value = String(data.configuration.terrain.seaLevel);
  get<HTMLInputElement>("roughness").value = String(data.configuration.terrain.roughness);
  get<HTMLInputElement>("window-x").value = String(data.window.x);
  get<HTMLInputElement>("window-y").value = String(data.window.y);
  get<HTMLSelectElement>("window-size").value = String(data.window.width);
  get("cell-inspector").textContent =
    `${data.window.width} × ${data.window.height} cells · 16 × 16 chunks`;
  status.textContent = source;
  loading.hidden = true;
}
function requestBody() {
  return {
    generatorVersion: VERSION,
    seed: seed.value,
    preset: preset.value,
    terrain: {
      scale: Number(get<HTMLInputElement>("terrain-scale").value),
      seaLevel: Number(get<HTMLInputElement>("sea-level").value),
      roughness: Number(get<HTMLInputElement>("roughness").value),
    },
    window: {
      x: Number(get<HTMLInputElement>("window-x").value),
      y: Number(get<HTMLInputElement>("window-y").value),
      width: Number(get<HTMLSelectElement>("window-size").value),
      height: Number(get<HTMLSelectElement>("window-size").value),
    },
  };
}
async function loadPreset(id: string) {
  const { token, signal } = startRequest();
  error.hidden = true;
  loading.hidden = false;
  generate.disabled = false;
  generate.innerHTML = 'Generate <span aria-hidden="true">↗</span>';
  try {
    let data = cache.get(id);
    if (!data) {
      const response = await fetch(`/demos/${id}.json`, { signal });
      if (!response.ok)
        throw new Error("This bundled demo could not load. Try generating a live world.");
      data = (await response.json()) as World;
      cache.set(id, data);
    }
    if (token !== requestNumber) return;
    seed.value = data.seed;
    show(data, "Bundled example · ready to explore");
  } catch (cause) {
    if (token !== requestNumber) return;
    error.textContent = cause instanceof Error ? cause.message : "Could not load this demo.";
    error.hidden = false;
    loading.hidden = true;
    status.textContent = "Demo unavailable";
  }
}
get<HTMLFormElement>("world-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const { token, signal } = startRequest();
  const body = requestBody();
  error.hidden = true;
  generate.disabled = true;
  generate.textContent = "Generating…";
  status.textContent = "Requesting your world…";
  try {
    const response = await fetch("/api/world", {
      signal,
      method: "QUERY",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const isJson = response.headers.get("Content-Type")?.includes("application/json");
    const data = isJson ? await response.json().catch(() => null) : null;
    if (!response.ok) {
      const fallback =
        response.status === 429
          ? `The service is busy (${response.status}). Please wait a moment and try again.`
          : response.status >= 500
            ? `World generation is temporarily unavailable (${response.status}). Try a smaller window or try again shortly.`
            : `Generation failed (${response.status}). Check your settings and try again.`;
      const message = data?.error?.message ?? data?.message ?? fallback;
      const issue = data?.error?.issues?.[0]?.message;
      throw new Error(issue && issue !== message ? `${message} ${issue}` : message);
    }
    if (!data || !Array.isArray(data.biome) || !Array.isArray(data.elevation)) {
      throw new Error("The service returned an unreadable world. Please try again shortly.");
    }
    if (token !== requestNumber) return;
    show(data as World, "Live world · deterministic generation");
  } catch (cause) {
    if (token !== requestNumber) return;
    error.textContent =
      cause instanceof Error ? cause.message : "Generation failed. Please try again.";
    error.hidden = false;
    status.textContent = "Request failed · previous world preserved";
  } finally {
    if (token === requestNumber) {
      loading.hidden = true;
      generate.disabled = false;
      generate.innerHTML = 'Generate <span aria-hidden="true">↗</span>';
    }
  }
});
preset.addEventListener("change", () => void loadPreset(preset.value));
layer.addEventListener("change", () => {
  if (world) {
    paintWorld(raster, world, layer.value);
    draw();
  }
});
get("shuffle").addEventListener("click", () => {
  seed.value = `world-${crypto.getRandomValues(new Uint32Array(1))[0]!.toString(36)}`;
  status.textContent = "New seed ready · select Generate to explore";
});
function zoom(factor: number, x = canvas.clientWidth / 2, y = canvas.clientHeight / 2) {
  const next = Math.max(fitScale * 0.5, Math.min(fitScale * 12, scale * factor));
  offsetX = x - (x - offsetX) * (next / scale);
  offsetY = y - (y - offsetY) * (next / scale);
  scale = next;
  draw();
}
get("zoom-in").addEventListener("click", () => zoom(1.4));
get("zoom-out").addEventListener("click", () => zoom(1 / 1.4));
get("reset-view").addEventListener("click", reset);
canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX - rect.left, event.clientY - rect.top);
  },
  { passive: false },
);
let drag: { x: number; y: number } | undefined;
canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  drag = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener("pointermove", (event) => {
  if (drag) {
    offsetX += event.clientX - drag.x;
    offsetY += event.clientY - drag.y;
    drag = { x: event.clientX, y: event.clientY };
    draw();
  }
  if (world) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left - offsetX) / scale),
      y = Math.floor((event.clientY - rect.top - offsetY) / scale);
    if (x >= 0 && y >= 0 && x < world.window.width && y < world.window.height) {
      const i = y * world.window.width + x;
      get("cell-inspector").textContent =
        `${x + world.window.x}, ${y + world.window.y} · ${world.biome[i]} · ↑ ${world.elevation[i]}`;
    }
  }
});
canvas.addEventListener("pointerup", () => {
  drag = undefined;
});
canvas.addEventListener("pointercancel", () => {
  drag = undefined;
});
canvas.addEventListener("keydown", (event) => {
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "0"];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  if (event.key === "+" || event.key === "=") zoom(1.4);
  else if (event.key === "-") zoom(1 / 1.4);
  else if (event.key === "0") reset();
  else {
    offsetX += event.key === "ArrowLeft" ? 32 : event.key === "ArrowRight" ? -32 : 0;
    offsetY += event.key === "ArrowUp" ? 32 : event.key === "ArrowDown" ? -32 : 0;
    draw();
  }
});
new ResizeObserver(() => reset()).observe(canvas.parentElement!);
async function copy(text: string, button: HTMLElement) {
  try {
    await navigator.clipboard.writeText(text);
    const original = button.textContent;
    button.textContent = "Copied!";
    setTimeout(() => {
      button.textContent = original;
    }, 1800);
  } catch {
    status.textContent = "Clipboard unavailable. Copy the example from the documentation.";
  }
}
get("copy-world-request").addEventListener("click", (event) => {
  const body = world
    ? {
        generatorVersion: world.generatorVersion,
        seed: world.seed,
        preset: world.preset,
        terrain: world.configuration.terrain,
        window: world.window,
      }
    : requestBody();
  void copy(
    `curl --request QUERY https://microworld.kaf.sh/api/world --header 'Content-Type: application/json' --data '${JSON.stringify(body).replaceAll("'", "'\"'\"'")}'`,
    event.currentTarget as HTMLElement,
  );
});
get("download-world").addEventListener("click", () => {
  if (!world) {
    status.textContent = "Load a world before downloading.";
    return;
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(world)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `microworld-${world.preset}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status.textContent = "World JSON downloaded";
});
document
  .querySelectorAll<HTMLButtonElement>("[data-copy]")
  .forEach((button) =>
    button.addEventListener(
      "click",
      () => void copy(get(button.dataset.copy!).textContent ?? "", button),
    ),
  );
document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((button) =>
  button.addEventListener("click", () => {
    preset.value = button.dataset.preset!;
    void loadPreset(preset.value);
    get("playground").scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }),
);
async function previews() {
  await Promise.allSettled(
    [...document.querySelectorAll<HTMLCanvasElement>("[data-preview]")].map(async (target) => {
      const id = target.dataset.preview!;
      const response = await fetch(`/demos/${id}.json`);
      if (!response.ok) return;
      const data = (await response.json()) as World;
      cache.set(id, data);
      paintWorld(target, data);
    }),
  );
}
void loadPreset(preset.value);
void previews();
