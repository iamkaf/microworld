export type TileTemplate = (string | null)[][];
export const BUILTIN_TEMPLATES: Record<string, TileTemplate> = {
  cottage: [
    ["wall", "wall", "wall", "wall", "wall"],
    ["wall", "floor", "floor", "floor", "wall"],
    ["wall", "floor", "floor", "floor", "wall"],
    ["wall", "wall", "door", "wall", "wall"],
  ],
  ruin: [
    ["stone", null, "stone"],
    [null, "floor", null],
    ["stone", null, "stone"],
  ],
  shrine: [
    [null, "pillar", null],
    ["pillar", "altar", "pillar"],
    [null, "steps", null],
  ],
};
export function rotateTemplate(template: TileTemplate, rotation: number): TileTemplate {
  let rows = template.map((row) => [...row]);
  for (let turn = 0; turn < rotation / 90; turn++)
    rows = rows[0].map((_, x) => rows.map((row) => row[x]).reverse());
  return rows;
}
