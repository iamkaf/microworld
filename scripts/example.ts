import { generateWorld } from "../src/generate.ts";

console.log(
  JSON.stringify(
    generateWorld({ seed: "hello-microworld", window: { x: 128, y: 128, width: 16, height: 16 } }),
    null,
    2,
  ),
);
