// Shared-storage endpoint backing the frontend's window.storage shim.
// GET is public (anyone with the link can view once past the app's passcode);
// PUT is allowlisted by key and gated by the pool code — same courtesy-lock
// philosophy as the original artifact, not real auth.
import { kvGet, kvSet, kvConfigured } from "../lib/redis.js";

const ALLOWED = new Set(["wc26:pool", "wc26:lock", "wc26:probe"]);
const POOL_CODE = (process.env.POOL_CODE || "WC26FUN").toUpperCase();

export default async function handler(req, res) {
  if (!kvConfigured()) return res.status(500).json({ error: "storage not configured" });
  const key = String(req.query.key || "");
  if (!ALLOWED.has(key)) return res.status(400).json({ error: "unknown key" });

  if (req.method === "GET") {
    const value = await kvGet(key);
    if (value == null) return res.status(404).json({ error: "not found" });
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(value);
  }

  if (req.method === "PUT") {
    const code = String(req.headers["x-pool-code"] || "").toUpperCase();
    if (code !== POOL_CODE) return res.status(403).json({ error: "bad pool code" });
    const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? "");
    if (body.length > 256 * 1024) return res.status(413).json({ error: "too large" });
    await kvSet(key, body);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: "method not allowed" });
}
