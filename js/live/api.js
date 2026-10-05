// Hosted n8n endpoints with a local development fallback, plus runtime
// overrides from the in-app settings menu (kept in localStorage — the public
// repo never carries a secret).
const N8N_BASE = "https://vmi3364148.contaboserver.net/webhook";

export function getSettings() {
  try {
    return {
      base: (localStorage.getItem("manbar.n8nBase") || "").trim().replace(/\/+$/, ""),
      key: (localStorage.getItem("manbar.openaiKey") || "").trim()
    };
  } catch { return { base: "", key: "" }; }
}
export function saveSettings({ base, key }) {
  try {
    base ? localStorage.setItem("manbar.n8nBase", base.trim()) : localStorage.removeItem("manbar.n8nBase");
    key ? localStorage.setItem("manbar.openaiKey", key.trim()) : localStorage.removeItem("manbar.openaiKey");
  } catch {}
}

// ---- last-resort direct mode (dev/demo): the key the user typed in the
// settings menu talks to OpenAI straight from this browser ----
const VOCAB = [["GLOSS_ALLAH","الله"],["GLOSS_ALHAMD","الحمد لله"],["GLOSS_SALAH","الصلاة"],["GLOSS_SALAM","السلام"],["GLOSS_NAS","الناس"],["GLOSS_TAQWA","التقوى"],["GLOSS_IHSAN","الإحسان"],["GLOSS_JUMUAH","الجمعة"],["GLOSS_QURAN","القرآن"],["GLOSS_NABI","النبي"],["GLOSS_KHAYR","خير"],["GLOSS_AMAL","العمل"],["GLOSS_SAWA","سواء"],["GLOSS_DUA","الدعاء"],["GLOSS_ISLAM","الإسلام"],["GLOSS_YAWM","يوم"],["GLOSS_QALB","القلب"],["GLOSS_RAHMA","الرحمة"]];

async function directGloss(text, key, signal) {
  const sys = "أنت مترجم من العربية إلى تسلسل إشارات (Gloss). المفردات المتاحة فقط: " +
    VOCAB.map(([id, ar]) => `${id}=${ar}`).join("، ") +
    '. أعد JSON فقط: مصفوفة glosses عناصرها إما نص المعرف مباشرة أو كائن تهجئة. مثال صحيح حرفياً: {"glosses":["GLOSS_TAQWA","GLOSS_ALLAH",{"spell":"اغفر"}]}. ممنوع أي شكل آخر للعناصر. حد أقصى تهجئتان لكلمات مفردة؛ احذف أي كلمة غير مغطاة؛ لا شرح.';
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", signal,
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini", temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: sys }, { role: "user", content: text }]
    })
  });
  if (!r.ok) throw new Error(`OpenAI: ${r.status}`);
  const d = await r.json();
  const raw = d.choices?.[0]?.message?.content ?? "";
  let glosses = [];
  try {
    const valid = new Set(VOCAB.map(v => v[0]));
    let spells = 0;
    for (let g of (JSON.parse(raw).glosses || [])) {
      // tolerate wrapper shapes like {"glosses":"GLOSS_X"} or {"id":"GLOSS_X"}
      if (g && typeof g === "object" && !g.spell) {
        g = Object.values(g).find(v => typeof v === "string" && valid.has(v)) ?? g;
      }
      if (typeof g === "string" && valid.has(g)) glosses.push(g);
      else if (g?.spell) {
        const w = String(g.spell).trim().split(/\s+/)[0];
        if (w.length >= 2 && ++spells <= 2) glosses.push({ spell: w });
      }
    }
  } catch (e) {
    console.warn("direct gloss parse failed:", e?.message, raw.slice(0, 200));
  }
  return { glosses, backend: "direct" };
}

async function directAsr(blob, key, signal) {
  const fd = new FormData();
  fd.append("file", blob, "audio.webm");
  fd.append("model", "whisper-1");
  fd.append("language", "ar");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", signal, headers: { "Authorization": `Bearer ${key}` }, body: fd
  });
  if (!r.ok) throw new Error(`OpenAI: ${r.status}`);
  return { text: (await r.json()).text || "" };
}
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
    const cfg = getSettings();
    for (const base of [cfg.base, N8N_BASE].filter(Boolean)) {
      try {
        const health = await probe(`${base}/manbar-health`);
        if (health.key === true) return resolved = {
          name: "n8n", key: true,
          gloss: `${base}/manbar-gloss`, asr: `${base}/manbar-asr`
        };
      } catch {}
    }
    try { return resolved = await localBackend(); } catch {}
    if (cfg.key) return resolved = { name: "direct", key: true, gloss: "direct", asr: "direct" };
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
    if (target[kind] === "direct") {
      const key = getSettings().key;
      if (!key) throw new Error("No AI backend available");
      return kind === "gloss"
        ? directGloss(JSON.parse(options.body || "{}").text || "", key, options.signal)
        : directAsr(options.body, key, options.signal);
    }
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (options.signal?.aborted) cancel();
    else options.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, 30000);
    let response, data;
    try {
      response = await fetch(target[kind], { ...options, signal: controller.signal });
      data = await response.json();
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
    }
    if (!response.ok) throw new Error(`Backend request failed: ${response.status}`);
    const valid = kind === "gloss" ? Array.isArray(data.glosses) : typeof data.text === "string";
    if (!valid) throw new Error("Invalid backend response");
    return data;
  }
  try { return await request(backend); } catch (error) {
    if (options.signal?.aborted || backend.name !== "n8n") throw error;
    try {
      const local = await localBackend();
      const data = await request(local);
      resolved = local;
      return data;
    } catch (localError) {
      const key = getSettings().key;
      if (!key) throw localError;
      const direct = { name: "direct", key: true, gloss: "direct", asr: "direct" };
      const data = await request(direct);
      resolved = direct;
      return data;
    }
  }
}
