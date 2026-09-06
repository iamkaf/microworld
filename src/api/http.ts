export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  const resultHeaders = new Headers(headers);
  resultHeaders.set("Content-Type", "application/json; charset=utf-8");
  resultHeaders.set("Cache-Control", "no-store");
  resultHeaders.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(value), { status, headers: resultHeaders });
}

/** Most specific media range wins, so application/json;q=0 overrides */
/** a broader wildcard. Requests without Accept accept any media type. */
export function accepts(header: string | null, type: string): boolean {
  if (header === null) return true;
  let specificity = -1;
  let quality = 0;
  for (const range of header.split(",")) {
    const [media, ...parameters] = range.trim().toLowerCase().split(";");
    const score =
      media === type ? 2 : media === `${type.split("/")[0]}/*` ? 1 : media === "*/*" ? 0 : -1;
    if (score < 0 || score < specificity) continue;
    const q = parameters.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const value = q === undefined ? 1 : Number(q.slice(2));
    const validQuality = Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
    quality = score === specificity ? Math.max(quality, validQuality) : validQuality;
    specificity = score;
  }
  return quality > 0;
}

export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const media = request.headers.get("Content-Type");
  if (!media)
    throw new HttpError(400, "missing_content_type", "Content-Type: application/json is required.");
  if (media.split(";", 1)[0].trim().toLowerCase() !== "application/json")
    throw new HttpError(415, "unsupported_media_type", "Use Content-Type: application/json.");
  const declared = request.headers.get("Content-Length");
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared))))
    throw new HttpError(400, "invalid_content_length", "Invalid Content-Length.");
  if (declared !== null && Number(declared) > maxBytes)
    throw new HttpError(413, "body_too_large", `Request body exceeds ${maxBytes} bytes.`);
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "invalid_json", "Request body must contain JSON.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "body_too_large", `Request body exceeds ${maxBytes} bytes.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid UTF-8 JSON.");
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
