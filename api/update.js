// "Update now" endpoint — same stateless computation as /api/pool, but never
// CDN-cached, so a human press always returns this-second data. The frontend
// applies the returned pool directly.
import { buildPool } from "../lib/pipeline.js";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  try {
    const pool = await buildPool();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ pool });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
