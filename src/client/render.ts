import { terrainColor } from "../map-colors.ts";
import { tileColor } from "../palette.ts";
import { paintRpg } from "./rpg-tiles.ts";
import type { World } from "./world.ts";

export function paintWorld(
  target: HTMLCanvasElement,
  data: World,
  view = "biome",
  mapStyle = "block",
) {
  if (mapStyle === "classic" && view === "biome") {
    paintRpg(target, data);
    return;
  }
  target.width = data.window.width;
  target.height = data.window.height;
  const context = target.getContext("2d")!;
  data.biome.forEach((_biome, i) => {
    const elevation = data.elevation[i] ?? 0;
    if (view === "walkability") context.fillStyle = data.walkable[i] ? "#a3bc82" : "#545653";
    else if (view === "elevation") {
      const value = Math.round((elevation / 65535) * 220) + 20;
      context.fillStyle = `rgb(${value},${value},${value})`;
    } else context.fillStyle = terrainColor(data, i);
    context.fillRect(i % data.window.width, Math.floor(i / data.window.width), 1, 1);
  });
  if (view === "objects") {
    context.fillStyle = "#ffffff80";
    context.fillRect(0, 0, target.width, target.height);
  }
  if (view !== "elevation" && view !== "walkability") {
    for (const object of data.objects ?? []) {
      if (view !== "objects" && (object.width ?? 1) > 1) continue;
      context.fillStyle =
        view === "objects"
          ? "#444333"
          : object.object === "giant-mushroom"
            ? "#c4a8c9"
            : object.object === "mineral"
              ? "#c4c8d0"
              : "#30543d";
      context.fillRect(
        object.x - data.window.x,
        object.y - data.window.y,
        object.width ?? 1,
        object.height ?? 1,
      );
    }
    for (const tile of data.tiles ?? []) {
      context.fillStyle = tileColor(tile.tile);
      context.fillRect(tile.x - data.window.x, tile.y - data.window.y, 1, 1);
    }
  }
}
