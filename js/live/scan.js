// «صوّر خطبتك» — the imam photographs the printed khutbah; GPT-4o-mini vision
// turns it into text, the imam reviews it, and it enters the same pipeline as
// an uploaded .txt (handed to #obFile, which flow.js already ingests).
// Server route: /api/ocr (server.js locally, api/ocr.js on Vercel), with the
// settings-menu key as a last resort.
import { getSettings } from "./api.js";

const $ = s => document.querySelector(s);
const OCR_PROMPT = "أنت تقرأ صورة لورقة خطبة جمعة مكتوبة بالعربية. انسخ النص كما هو مكتوب حرفياً دون إضافة أو حذف أو تصحيح أو تلخيص. حافظ على الآيات والأحاديث كما هي بتشكيلها إن وُجد. اجعل كل جملة في سطر مستقل. تجاهل أرقام الصفحات والهوامش والعناوين المتكررة. إن لم تجد نص خطبة فأعد نصاً فارغاً. أعد JSON فقط: {\"text\":\"...\"}";

export async function apiOcr(image) {
  try {
    const r = await fetch("/api/ocr", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }), signal: AbortSignal.timeout(60000)
    });
    if (r.ok) {
      const d = await r.json();
      if (typeof d.text === "string") return d.text;
    }
  } catch {}
  const key = getSettings().key;
  if (!key) throw new Error("no_backend");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini", temperature: 0, response_format: { type: "json_object" },
      messages: [{ role: "system", content: OCR_PROMPT },
        { role: "user", content: [{ type: "image_url", image_url: { url: image, detail: "high" } }] }]
    })
  });
  if (!r.ok) throw new Error(`OpenAI: ${r.status}`);
  const d = await r.json();
  return String(JSON.parse(d.choices?.[0]?.message?.content || "{}").text || "");
}

function shrink(file, max = 1600) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

const CSS = `/* «صوّر خطبتك» */
.ob-card .scan-btn {
  width: 100%; display: flex; align-items: center; gap: 14px; margin-bottom: 12px;
  padding: 16px 18px; border-radius: 14px; cursor: pointer; text-align: right; font: inherit;
  background: linear-gradient(135deg, rgba(139,124,246,.22), rgba(46,242,194,.10));
  border: 1px solid rgba(139,124,246,.55); color: var(--cream); transition: transform .2s, border-color .2s;
}
.ob-card .scan-btn:hover { transform: translateY(-1px); border-color: var(--gold); }
.ob-card .scan-btn svg { flex: none; color: var(--gold); }
.ob-card .scan-btn strong { display: block; font-size: 15.5px; }
.ob-card .scan-btn small { display: block; font-size: 12.5px; color: rgba(243,241,251,.6); margin-top: 2px; }
.ocr-scan { position: relative; border-radius: 12px; overflow: hidden; max-height: 210px; margin-bottom: 12px; background: rgba(243,241,251,.05); }
.ocr-scan img { display: block; width: 100%; max-height: 210px; object-fit: cover; opacity: .75; }
.ocr-scan i { position: absolute; inset-inline: 0; top: 0; height: 3px; background: var(--gold); box-shadow: 0 0 18px 4px var(--gold); animation: ocrline 1.6s ease-in-out infinite alternate; }
.ocr-scan.done i { display: none; }
@keyframes ocrline { to { top: calc(100% - 3px); } }
.ocr-text {
  width: 100%; border-radius: 12px; padding: 12px 14px; font: inherit; font-size: 14.5px; line-height: 1.9;
  background: rgba(243,241,251,.06); color: var(--cream); border: 1px solid rgba(243,241,251,.15); resize: vertical; margin-bottom: 12px;
}
.ocr-actions { display: grid; gap: 8px; justify-items: center; }
`;

function mount() {
  const drop = $("#obDrop"), pipe = $("#obPipe"), fileInput = $("#obFile");
  if (!drop || !pipe || !fileInput || $("#obScan")) return;
  const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);

  const hint = drop.closest(".ob-step")?.querySelector(".ob-hint");
  if (hint) hint.textContent = hint.textContent.replace("يرفع الإمام نص الخطبة قبل الجمعة،", "يصوّر الإمام خطبته أو يرفع نصّها قبل الجمعة،");

  drop.insertAdjacentHTML("beforebegin", `
    <button type="button" class="scan-btn" id="obScan">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><circle cx="12" cy="12" r="3.2"/></svg>
      <span><strong>صوّر خطبتك</strong><small>التقط صورة لورقة الخطبة — صفحة أو أكثر</small></span>
    </button>
    <input type="file" id="obCam" accept="image/*" capture="environment" multiple hidden />`);
  pipe.insertAdjacentHTML("beforebegin", `
    <div id="obOcr" class="ob-ocr" hidden>
      <p class="ob-pipe-title" id="obOcrStatus">جارٍ قراءة الخطبة من الصورة…</p>
      <div class="ocr-scan" id="obOcrScan"><img id="obOcrImg" alt="" /><i></i></div>
      <div id="obOcrReview" hidden>
        <p class="ob-hint">راجع النص المستخرج وصحّحه إن لزم — كل جملة في سطر:</p>
        <textarea id="obOcrText" class="ocr-text" rows="9" dir="rtl"></textarea>
        <div class="ocr-actions">
          <button type="button" class="btn btn-gold" id="obOcrOk">اعتمد النص وجهّز الإشارات</button>
          <button type="button" class="pill linkish" id="obOcrRetry">إعادة التصوير</button>
        </div>
      </div>
    </div>`);

  const cam = $("#obCam"), box = $("#obOcr"), ui = $("#obUploadUi"), status = $("#obOcrStatus"), scan = $("#obOcrScan");
  $("#obScan").addEventListener("click", () => { cam.value = ""; cam.click(); });
  cam.addEventListener("change", () => cam.files.length && run([...cam.files]));
  $("#obOcrRetry").addEventListener("click", () => { box.hidden = true; ui.hidden = false; });
  $("#obOcrOk").addEventListener("click", () => {
    const text = $("#obOcrText").value;
    const n = text.split(/[\n.!؟]+/).map(s => s.trim()).filter(s => s.length >= 8).length;
    if (n < 2) { status.textContent = "النص قصير جداً — أضف جملتين على الأقل أو أعد التصوير"; return; }
    const dt = new DataTransfer();
    dt.items.add(new File([text], "خطبة مصوّرة.txt", { type: "text/plain" }));
    fileInput.files = dt.files;
    box.hidden = true;
    fileInput.dispatchEvent(new Event("change"));
  });

  async function run(files) {
    ui.hidden = true; box.hidden = false; $("#obOcrReview").hidden = true;
    scan.classList.remove("done");
    const parts = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const data = await shrink(files[i]);
        $("#obOcrImg").src = data;
        status.textContent = files.length > 1
          ? `جارٍ قراءة الخطبة من الصورة… (${i + 1}/${files.length})`
          : "جارٍ قراءة الخطبة من الصورة…";
        parts.push((await apiOcr(data)).trim());
      }
    } catch (e) {
      scan.classList.add("done");
      status.textContent = e?.message === "no_backend"
        ? "قراءة الصور تحتاج خادم منبر المتصل بالذكاء الاصطناعي — ارفع ملف .txt أو اختر الخطبة الجاهزة"
        : "تعذّرت قراءة الصورة — حاول بصورة أوضح وإضاءة أفضل";
      $("#obOcrText").value = parts.join("\n");
      $("#obOcrReview").hidden = false;
      return;
    }
    scan.classList.add("done");
    const text = parts.filter(Boolean).join("\n");
    status.textContent = text
      ? `تمت قراءة ${files.length > 1 ? files.length + " صفحات" : "الصفحة"} ✓`
      : "لم نجد نص خطبة في الصورة — أعد التصوير";
    $("#obOcrText").value = text;
    $("#obOcrReview").hidden = false;
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
else mount();
