// منبر — dev server: static files + two AI proxy endpoints (zero npm deps).
// Run: node server.js; configure the API key in .env (works without a key too:
// the client then falls back to the local dictionary + Web Speech.)

const http = require("http");
const fs = require("fs");
const path = require("path");

// load .env if present (gitignored; keeps the key out of shell history)
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || "127.0.0.1";
const KEY = process.env.OPENAI_API_KEY || "";
const ROOT = __dirname;
const CACHE_FILE = path.join(ROOT, "data", "gloss-cache.json");

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary",
  ".webm": "video/webm", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2", ".fbx": "application/octet-stream"
};

// gloss vocabulary for the prompt, loaded once
let VOCAB = [];
try {
  const signs = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/lexicon/signs.json")));
  VOCAB = Object.entries(signs).filter(([k]) => !k.startsWith("_")).map(([id, v]) => ({ id, ar: v.ar }));
} catch {}

const SYSTEM = `أنت مترجم من العربية إلى تسلسل إشارات للغة الإشارة (Gloss).
المفردات المتاحة فقط:
${VOCAB.map(v => `${v.id} = ${v.ar}`).join("\n")}
حوّل جملة المستخدم إلى تسلسل بسيط بترتيب لغة الإشارة (الموضوع أولاً، أفعال مبسطة، احذف حروف الجر وأدوات التعريف).
أعد JSON فقط بهذا الشكل: {"glosses":[ "GLOSS_X", {"spell":"كلمة"}, ... ]}
قواعد صارمة:
- استخدم المعرفات من القائمة فقط.
- التهجئة {"spell":"..."} لكلمة واحدة بلا مسافات، وللكلمة الجوهرية فقط (اسم أو مفهوم لا غنى عنه).
- حد أقصى تهجئتان في الجملة كلها؛ أي كلمة أخرى غير مغطاة احذفها ببساطة.
- لا تضف أي شرح.`;

function readBody(req, limit = 25e6) {
  return new Promise((res, rej) => {
    const parts = [];
    let n = 0;
    req.on("data", c => { n += c.length; if (n > limit) { rej(new Error("too big")); req.destroy(); } else parts.push(c); });
    req.on("end", () => res(Buffer.concat(parts)));
    req.on("error", rej);
  });
}

function send(res, code, obj, headers = {}) {
  const body = typeof obj === "string" ? obj : JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(body);
}

function saveCache(key, items) {
  try {
    let cache = {};
    try { cache = JSON.parse(fs.readFileSync(CACHE_FILE)); } catch {}
    cache[key] = items;
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1));
  } catch {}
}

async function handleGloss(req, res) {
  if (!KEY) return send(res, 503, { error: "no_key" });
  const { text } = JSON.parse((await readBody(req)).toString() || "{}");
  if (!text) return send(res, 400, { error: "no_text" });
  const t0 = Date.now();
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: text }]
    })
  });
  if (!r.ok) return send(res, 502, { error: "openai", detail: (await r.text()).slice(0, 300) });
  const data = await r.json();
  let glosses = [];
  try {
    const parsed = JSON.parse(data.choices[0].message.content);
    const valid = new Set(VOCAB.map(v => v.id));
    glosses = (parsed.glosses || []).filter(g =>
      (typeof g === "string" && valid.has(g)) || (g && typeof g.spell === "string" && g.spell.length <= 20)
    );
  } catch {}
  // hard cap: max 2 spells, single-word each
  let spellCount = 0;
  glosses = glosses.filter(g => {
    if (typeof g === "string") return true;
    g.spell = g.spell.trim().split(/\s+/)[0];
    return g.spell.length >= 2 && ++spellCount <= 2;
  });
  const items = glosses.map(g => typeof g === "string" ? { kind: "gloss", id: g } : { kind: "spell", word: g.spell });
  saveCache(text.trim(), items);
  send(res, 200, { glosses, ms: Date.now() - t0 });
}

async function handleAsr(req, res) {
  if (!KEY) return send(res, 503, { error: "no_key" });
  const audio = await readBody(req);
  if (audio.length < 100) return send(res, 400, { error: "empty" });
  const boundary = "----manbar" + Math.random().toString(16).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="chunk.webm"\r\nContent-Type: audio/webm\r\n\r\n`);
  const fields = Buffer.from(
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1` +
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nar` +
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson` +
    `\r\n--${boundary}--\r\n`);
  const t0 = Date.now();
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat([head, audio, fields])
  });
  if (!r.ok) return send(res, 502, { error: "openai", detail: (await r.text()).slice(0, 300) });
  const data = await r.json();
  send(res, 200, { text: data.text || "", ms: Date.now() - t0 });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/health") return send(res, 200, { ok: true, key: !!KEY, vocab: VOCAB.length });
    if (req.method === "POST" && req.url === "/api/gloss") return await handleGloss(req, res);
    if (req.method === "POST" && req.url === "/api/asr") return await handleAsr(req, res);

    // static
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p === "/") p = "/index.html";
    if (req.method !== "GET" && req.method !== "HEAD") {
      return send(res, 405, { error: "method_not_allowed" }, { Allow: "GET, HEAD" });
    }
    const publicFile = ["/index.html", "/live.html", "/assets/credits.json",
      "/assets/character/translator.glb", "/tools/pose-editor.html"].includes(p);
    const publicFolder = /^\/(css|js|assets\/(img|video|lexicon))\//.test(p);
    if ((!publicFile && !publicFolder) || p.split("/").some(part => part.startsWith("."))) {
      return send(res, 404, { error: "not_found" });
    }
    const file = path.resolve(ROOT, "." + p);
    if (!file.startsWith(ROOT + path.sep)) return send(res, 403, { error: "forbidden" });
    const realFile = await fs.promises.realpath(file).catch(() => null);
    if (!realFile || !realFile.startsWith(ROOT + path.sep)) return send(res, 404, { error: "not_found" });
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, { error: "not_found", path: p });
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(req.method === "HEAD" ? undefined : buf);
    });
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`منبر dev server → http://localhost:${PORT}  (key: ${KEY ? "yes" : "no — dictionary/WebSpeech fallback"})`);
});
