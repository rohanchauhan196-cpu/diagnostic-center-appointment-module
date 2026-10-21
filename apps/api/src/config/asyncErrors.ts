import { createRequire } from "module";

/**
 * Express 4 ignores promises returned by route handlers, so a rejected async
 * handler never reaches the error middleware: the request hangs and Node
 * treats it as an unhandled rejection (which crashes the process).
 * This forwards those rejections to next(err), like Express 5 does natively.
 */
const require = createRequire(import.meta.url);
const Layer = require("express/lib/router/layer.js");

Layer.prototype.handle_request = function handle(this: { handle: Function }, req: unknown, res: unknown, next: (err?: unknown) => void) {
  const fn = this.handle;
  if (fn.length > 3) return next();
  try {
    const result = fn(req, res, next);
    if (result && typeof result.catch === "function") result.catch(next);
  } catch (err) {
    next(err);
  }
};
