// منبر — dev server: static files + two AI proxy endpoints (zero npm deps).
// Run: node server.js; configure the API key in .env (works without a key too:
// the client then falls back to the local dictionary + Web Speech.)

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

// load .env if present (gitignored; keeps the key out of shell history)
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || "0.0.0.0";   // LAN by default: the QR hand-off needs phone access; set HOST=127.0.0.1 to restrict
const KEY = process.env.OPENAI_API_KEY || "";
const ROOT = __dirname;
const CACHE_FILE = path.join(ROOT, "data", "gloss-cache.json");

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary",
  ".webm": "video/webm", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2", ".fbx": "application/octet-stream",
  ".mp3": "audio/mpeg"
};

// gloss vocabulary for the prompt, loaded once
let VOCAB = [];
for (const f of ["assets/lexicon/signs_karsl.json", "assets/lexicon/signs.json"]) {
  try {
    const signs = JSON.parse(fs.readFileSync(path.join(ROOT, f)));
    const have = new Set(VOCAB.map(v => v.ar));
    for (const [id, v] of Object.entries(signs)) if (!id.startsWith("_") && v.kind !== "letter" && v.kind !== "number" && !have.has(v.ar)) VOCAB.push({ id, ar: v.ar });
  } catch {}
}

const SYSTEM = `أنت مترجم من العربية إلى تسلسل إشارات للغة الإشارة (Gloss).
المفردات المتاحة فقط:
${VOCAB.map(v => `${v.id} = ${v.ar}`).join("\n")}
حوّل جملة المستخدم إلى تسلسل بسيط بترتيب لغة الإشارة (الموضوع أولاً، أفعال مبسطة، احذف حروف الجر وأدوات التعريف).
ترجم المعنى لا الألفاظ، واختر أقرب مفهوم متاح كما يفعل مترجم الإشارة: «اتقوا الله» ← الله تعالى، خائف · «أحسنوا» ← خير · «استغفروا» ← مغفرة · «عباد الله» ← ناس · «الذنوب» ← سيئات.
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

// ---- imam access: open (no account) — the imam page broadcasts directly -------
const crypto = require("crypto");

// ---- «صوّر خطبتك»: photo of the printed khutbah -> text (GPT-4o-mini vision) ----
const OCR_PROMPT = "أنت تقرأ صورة لورقة خطبة جمعة مكتوبة بالعربية. انسخ النص كما هو مكتوب حرفياً دون إضافة أو حذف أو تصحيح أو تلخيص. حافظ على الآيات والأحاديث كما هي بتشكيلها إن وُجد. اجعل كل جملة في سطر مستقل. تجاهل أرقام الصفحات والهوامش والعناوين المتكررة. إن لم تجد نص خطبة فأعد نصاً فارغاً. أعد JSON فقط: {\"text\":\"...\"}";
async function handleOcr(req, res) {
  if (!KEY) return send(res, 503, { error: "no_key" });
  const { image } = JSON.parse((await readBody(req, 12e6)).toString() || "{}");
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image || "")) return send(res, 400, { error: "bad_image" });
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini", temperature: 0, response_format: { type: "json_object" },
      messages: [{ role: "system", content: OCR_PROMPT },
        { role: "user", content: [{ type: "image_url", image_url: { url: image, detail: "high" } }] }]
    })
  });
  if (!r.ok) return send(res, 502, { error: "openai", detail: (await r.text()).slice(0, 300) });
  const d = await r.json();
  let text = "";
  try { text = String(JSON.parse(d.choices?.[0]?.message?.content || "{}").text || ""); } catch {}
  return send(res, 200, { text });
}

// ---- translation of khutbah sentences for the worshipper's language ---------
const LANGS = { en: "English", fr: "French", ur: "Urdu", id: "Indonesian", tr: "Turkish", bn: "Bengali", ms: "Malay" };
async function handleTranslate(req, res) {
  if (!KEY) return send(res, 503, { error: "no_key" });
  const { text, to } = JSON.parse((await readBody(req, 1e5)).toString() || "{}");
  if (!text || !LANGS[to]) return send(res, 400, { error: "bad_request" });
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini", temperature: 0.2, response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `Translate this Friday khutbah sentence from Arabic into ${LANGS[to]} for live subtitles in a mosque. Be faithful and reverent; keep Islamic terms (Allah, taqwa, the Prophet ﷺ). Do NOT translate Quran verses yourself: if the sentence contains one, translate only the surrounding words. Return JSON {"text":"..."} only.` },
        { role: "user", content: text }
      ]
    })
  });
  if (!r.ok) return send(res, 502, { error: "openai" });
  const d = await r.json();
  let out = "";
  try { out = JSON.parse(d.choices[0].message.content).text || ""; } catch {}
  send(res, 200, { text: out });
}

// ---- live session relay (TV screen -> phones on the same session) ---------
const liveChannels = new Map();   // mosque index -> Set<ServerResponse>
const lastEvents = new Map();     // mosque index -> [last "khutbah" event, last "perform" event]

function handleLiveStream(req, res, mosque) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });
  res.write("retry: 2000\n\n");
  for (const e of (lastEvents.get(mosque) || [])) res.write(`data: ${JSON.stringify(e)}\n\n`);
  if (!liveChannels.has(mosque)) liveChannels.set(mosque, new Set());
  const channel = liveChannels.get(mosque);
  channel.add(res);
  const ping = setInterval(() => res.write(": ping\n\n"), 20000);
  req.on("close", () => { clearInterval(ping); channel.delete(res); });
}

async function handleLivePush(req, res) {
  const { m, event } = JSON.parse((await readBody(req)).toString() || "{}");
  const key = String(m ?? "0");
  if (event && (event.type === "khutbah" || event.type === "perform" || event.type === "end")) {
    const L = (lastEvents.get(key) || []).filter(e => e.type !== event.type && !(event.type === "khutbah" && e.type === "perform"));
    lastEvents.set(key, event.type === "end" ? [] : [...L, event]);
  }
  const channel = liveChannels.get(key);
  let listeners = 0;
  if (channel) {
    const frame = `data: ${JSON.stringify(event || {})}\n\n`;
    for (const client of channel) { client.write(frame); listeners++; }
  }
  send(res, 200, { ok: true, listeners });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/health") {
      const ip = Object.values(os.networkInterfaces()).flat()
        .find(i => i && i.family === "IPv4" && !i.internal)?.address || null;
      return send(res, 200, { ok: true, key: !!KEY, vocab: VOCAB.length, ip });
    }
    if (req.method === "POST" && req.url === "/api/gloss") return await handleGloss(req, res);
    if (req.method === "POST" && req.url === "/api/asr") return await handleAsr(req, res);
    if (req.url.startsWith("/api/live/stream")) {
      const mosque = new URL(req.url, "http://x").searchParams.get("m") || "0";
      return handleLiveStream(req, res, mosque);
    }
    if (req.method === "POST" && req.url === "/api/live/push") return await handleLivePush(req, res);
    if (req.method === "POST" && req.url === "/api/translate") return await handleTranslate(req, res);
    if (req.method === "POST" && req.url === "/api/ocr") return await handleOcr(req, res);

    // static
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p === "/") p = "/index.html";
    if (req.method !== "GET" && req.method !== "HEAD") {
      return send(res, 405, { error: "method_not_allowed" }, { Allow: "GET, HEAD" });
    }
    const publicFile = ["/index.html", "/live.html", "/about.html", "/assets/credits.json",
      "/assets/character/translator.glb", "/tools/pose-editor.html"].includes(p);
    const publicFolder = /^\/(css|js|assets\/(img|video|lexicon|quran|fonts|audio))\//.test(p);
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
