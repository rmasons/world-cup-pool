import { createRoot } from "react-dom/client";
import "./index.css";
import WorldCupPool from "./WorldCupPool.jsx";

// Drop-in replacement for the Claude-artifact shared storage API the component
// was written against — same get/set signature. The backend is stateless: the
// pool is computed live from ESPN data, so reads hit /api/pool and writes are
// rejected (roster changes live in lib/config.js or the POOL_ROSTERS env var;
// the app's own "Could not save shared data" message handles the rare attempt).
window.storage = {
  get: async (key) => {
    if (key !== "wc26:pool") throw new Error("missing");
    const r = await fetch("/api/pool");
    if (!r.ok) throw new Error("unavailable");
    return { value: await r.text() };
  },
  set: async () => {
    throw new Error("read-only");
  },
};

// No StrictMode: the artifact never ran under it, and its dev-mode double-mount
// would double-fire the component's auto-update effects.
createRoot(document.getElementById("root")).render(<WorldCupPool />);
