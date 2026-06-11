// Thin Upstash Redis REST helpers — no SDK dependency.
// Works with env vars from the Vercel Upstash integration (UPSTASH_*) or legacy Vercel KV (KV_*).
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const headers = () => ({ Authorization: `Bearer ${TOKEN}` });

export async function kvGet(key) {
  const r = await fetch(`${URL_}/get/${encodeURIComponent(key)}`, { headers: headers() });
  if (!r.ok) throw new Error(`redis get failed (${r.status})`);
  const d = await r.json();
  return d.result ?? null; // string or null
}

export async function kvSet(key, value) {
  const r = await fetch(`${URL_}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: headers(),
    body: value,
  });
  if (!r.ok) throw new Error(`redis set failed (${r.status})`);
}

export function kvConfigured() {
  return Boolean(URL_ && TOKEN);
}
