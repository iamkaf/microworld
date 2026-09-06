import assert from "node:assert/strict";
import test from "node:test";
import { createNoiseSampler, hashText, noise } from "../src/random.ts";

test("cached noise matches the reference exactly at ordinary and extreme coordinates", () => {
  const seed = hashText("cached-coordinate-regression");
  for (const origin of [0, 13, 2 ** 32, 2 ** 48, Number.MAX_SAFE_INTEGER - 256]) {
    for (const scale of [2, 5, 7, 128, 4096, 8192]) {
      for (const salt of [0, 1, 7]) {
        const sampler = createNoiseSampler(seed, BigInt(origin), BigInt(origin), scale, salt);
        for (const dx of [-128, -1, 0, 1, 15, 64, 256]) {
          for (const dy of [256, 17, 0, -63]) {
            assert.equal(
              sampler(dx, dy),
              noise(seed, BigInt(origin) + BigInt(dx), BigInt(origin) + BigInt(dy), scale, salt),
            );
          }
        }
      }
    }
  }
});
