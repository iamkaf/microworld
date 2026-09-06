import { generateWorld } from "../src/generate.ts";

const samples = 20;
console.log(
  `Node ${process.version}; ${process.platform}/${process.arch}; ${samples} samples after 5 warmups. Includes validation and JSON serialization. Local timings, not Worker measurements.`,
);
for (const width of [16, 64, 128, 256]) {
  for (const placements of [
    [],
    [{ id: "trees", object: "tree", pitch: 16, minSpacing: 3, probability: 0.5 }],
  ]) {
    const request = {
      seed: "benchmark",
      window: { x: 2 ** 40, y: 2 ** 40, width, height: width },
      placements,
    };
    for (let i = 0; i < 5; i++) JSON.stringify(generateWorld(request));
    const times: number[] = [];
    let bytes = 0;
    for (let i = 0; i < samples; i++) {
      const start = performance.now();
      bytes = Buffer.byteLength(JSON.stringify(generateWorld(request)));
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        window: `${width}x${width}`,
        placements: placements.length > 0,
        medianMs: +times[10].toFixed(2),
        p95Ms: +times[18].toFixed(2),
        bytes,
      }),
    );
  }
}
