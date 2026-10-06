// Vercel serverless twin of server.js /api/ocr — «صوّر خطبتك».
// Needs the OPENAI_API_KEY environment variable in the Vercel project.
const OCR_PROMPT = "أنت تقرأ صورة لورقة خطبة جمعة مكتوبة بالعربية. انسخ النص كما هو مكتوب حرفياً دون إضافة أو حذف أو تصحيح أو تلخيص. حافظ على الآيات والأحاديث كما هي بتشكيلها إن وُجد. اجعل كل جملة في سطر مستقل. تجاهل أرقام الصفحات والهوامش والعناوين المتكررة. إن لم تجد نص خطبة فأعد نصاً فارغاً. أعد JSON فقط: {\"text\":\"...\"}";
module.exports = async (req, res) => {
  const KEY = process.env.OPENAI_API_KEY || "";
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") { res.statusCode = 405; return res.end('{"error":"method"}'); }
  if (!KEY) { res.statusCode = 503; return res.end('{"error":"no_key"}'); }
  const image = (req.body && req.body.image) || "";
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image)) { res.statusCode = 400; return res.end('{"error":"bad_image"}'); }
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini", temperature: 0, response_format: { type: "json_object" },
      messages: [{ role: "system", content: OCR_PROMPT },
        { role: "user", content: [{ type: "image_url", image_url: { url: image, detail: "high" } }] }]
    })
  });
  if (!r.ok) { res.statusCode = 502; return res.end(JSON.stringify({ error: "openai" })); }
  const d = await r.json();
  let text = "";
  try { text = String(JSON.parse(d.choices?.[0]?.message?.content || "{}").text || ""); } catch {}
  res.statusCode = 200; res.end(JSON.stringify({ text }));
};
