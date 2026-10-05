// Hosted n8n endpoints with a local development fallback.
const N8N_BASE = "https://vmi3364148.contaboserver.net/webhook";
const NONE = { name: "none", key: false, gloss: null, asr: null };
let resolved = null;
let resolving = null;

async function probe(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
  if (!response.ok) throw new Error(`Health check: ${response.status}`);
  const health = await response.json();
  if (health.ok !== true) throw new Error("Backend is unavailable");
  return health;
}

async function localBackend() {
  const health = await probe("/api/health");
  return { name: "local", key: health.key === true, gloss: "/api/gloss", asr: "/api/asr" };
}

export async function apiResolve() {
  if (resolved) return resolved;
  if (!resolving) resolving = (async () => {
    try {
      const health = await probe(`${N8N_BASE}/manbar-health`);
      if (health.key === true) return resolved = {
        name: "n8n", key: true,
        gloss: `${N8N_BASE}/manbar-gloss`, asr: `${N8N_BASE}/manbar-asr`
      };
    } catch {}
    try { return resolved = await localBackend(); } catch {}
    return resolved = { ...NONE };
  })();
  return resolving;
}

export function apiCurrent() { return resolved || { ...NONE }; }

export async function apiRequest(kind, options) {
  if (kind !== "gloss" && kind !== "asr") throw new Error("Unknown API operation");
  const backend = await apiResolve();
  async function request(target) {
    if (!target.key || !target[kind]) throw new Error("No AI backend available");
    const response = await fetch(target[kind], { ...options, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Backend request failed: ${response.status}`);
    const data = await response.json();
    const valid = kind === "gloss" ? Array.isArray(data.glosses) : typeof data.text === "string";
    if (!valid) throw new Error("Invalid backend response");
    return data;
  }
  try { return await request(backend); } catch (error) {
    if (backend.name !== "n8n") throw error;
    const local = await localBackend();
    const data = await request(local);
    resolved = local;
    return data;
  }
}
