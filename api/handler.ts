import { handleRequest } from "../src/worker.ts";

export default {
  fetch(request: Request): Promise<Response> {
    return handleRequest(request, {
      MCP_ALLOWED_ORIGINS: process.env.MCP_ALLOWED_ORIGINS,
      MAX_BODY_BYTES: process.env.MAX_BODY_BYTES,
      MAX_CELLS: process.env.MAX_CELLS,
      MAX_SIDE: process.env.MAX_SIDE,
      MAX_RULES: process.env.MAX_RULES,
      MAX_WORK: process.env.MAX_WORK,
    });
  },
};
