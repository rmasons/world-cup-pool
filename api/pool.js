// Read endpoint backing the frontend's window.storage shim. Computes the pool
// live and lets Vercel's CDN absorb traffic: 15 minutes fresh, an hour of
// stale-while-revalidate so visitors never wait on ESPN.
import { buildPool } from "../lib/pipeline.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method not allowed" });
  }
  try {
    const pool = await buildPool();
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
    return res.status(200).json(pool);
  } catch (e) {
    return res.status(502).json({ error: String(e?.message || e) });
  }
}
