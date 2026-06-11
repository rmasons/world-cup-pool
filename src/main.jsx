import { createRoot } from "react-dom/client";
import "./index.css";
import WorldCupPool from "./WorldCupPool.jsx";

// Drop-in replacement for the Claude-artifact shared storage API the component
// was written against — same get/set signature, backed by /api/kv. The pool-code
// header is the same courtesy lock the app itself uses (obfuscation, not auth).
window.storage = {
  get: async (key) => {
    const r = await fetch(`/api/kv?key=${encodeURIComponent(key)}`);
    if (!r.ok) throw new Error("missing");
    return { value: await r.text() };
  },
  set: async (key, value) => {
    const r = await fetch(`/api/kv?key=${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "x-pool-code": "WC26FUN" },
      body: value,
    });
    if (!r.ok) throw new Error("write failed");
  },
};

// No StrictMode: the artifact never ran under it, and its dev-mode double-mount
// would double-fire the component's auto-update effects.
createRoot(document.getElementById("root")).render(<WorldCupPool />);
