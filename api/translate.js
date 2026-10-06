// Vercel serverless twin of server.js /api/translate — khutbah sentence -> worshipper's language.
// Needs the OPENAI_API_KEY environment variable in the Vercel project.
const LANGS = { en: "English", fr: "French", ur: "Urdu", id: "Indonesian", tr: "Turkish", bn: "Bengali", ms: "Malay" };
module.exports = async (req, res) => {
  const KEY = process.env.OPENAI_API_KEY || "";
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") { res.statusCode = 405; return res.end('{"error":"method"}'); }
  if (!KEY) { res.statusCode = 503; return res.end('{"error":"no_key"}'); }
  const { text, to } = req.body || {};
  if (!text || !LANGS[to]) { res.statusCode = 400; return res.end('{"error":"bad_request"}'); }
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini", temperature: 0.2, response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `Translate this Friday khutbah sentence from Arabic into ${LANGS[to]} for live subtitles in a mosque. Be faithful and reverent; keep Islamic terms (Allah, taqwa, the Prophet ﷺ). Do NOT translate Quran verses yourself: if the sentence contains one, translate only the surrounding words. Return JSON {"text":"..."} only.` },
        { role: "user", content: String(text) }
      ]
    })
  });
  if (!r.ok) { res.statusCode = 502; return res.end('{"error":"openai"}'); }
  const d = await r.json();
  let out = "";
  try { out = String(JSON.parse(d.choices?.[0]?.message?.content || "{}").text || ""); } catch {}
  res.statusCode = 200; res.end(JSON.stringify({ text: out }));
};
