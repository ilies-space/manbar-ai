// imam dashboard: pipeline status, review table, side panels

(() => {
  const segs = KHUTBAH.segments;
  const sentences = segs.filter(s => s.type !== "verse");
  const verses = segs.filter(s => s.type === "verse");
  const edited = sentences.filter(s => s.review === "edited").length;
  const approvedClean = sentences.filter(s => s.review === "approved").length;
  const fidelity = Math.round((approvedClean / sentences.length) * 100);
  const termKeys = [...new Set(segs.flatMap(s => s.terms || []))];

  $("#dashMeta").textContent =
    `${KHUTBAH.mosque} · ${KHUTBAH.date} · رُفعت ${KHUTBAH.uploadedAt}`;

  // pipeline steps
  $("#stepsRow").innerHTML = [
    ["رفع الخطبة", KHUTBAH.uploadedAt],
    ["التيسير الآلي", `${segs.length} جملة خلال 40 ثانية`],
    ["المراجعة الشرعية", `${approvedClean} أُقرّت · ${edited} عُدِّلت`],
    ["جاهزة للعرض", "اكتملت قبل موعد الجمعة"]
  ].map(([h, p], i) => `
    <div class="step-pill">
      <span class="dot">✓</span>
      <div><h5>${i + 1}. ${h}</h5><p>${p}</p></div>
    </div>`).join("");

  // stat cards
  $("#dashStats").innerHTML = [
    [segs.length, "جملة في الخطبة"],
    [verses.length, "آية مكتشفة ومطابقة مع المصحف"],
    [termKeys.length, "مصطلحات مرتبطة بإشارات"],
    [`${fidelity}٪`, "سلامة المعنى: أُقرّت دون تعديل"]
  ].map(([v, l]) => `<div class="dstat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");

  // review table
  const chip = s => {
    if (s.type === "verse") return `<span class="chip chip-outline">آية — تُعرض كما هي</span>`;
    if (s.review === "edited") return `<span class="chip chip-gold">عُدِّلت ثم أُقرّت</span>`;
    return `<span class="chip chip-green">أُقرّت</span>`;
  };
  $("#reviewTable tbody").innerHTML = segs.map(s => `
    <tr class="${s.type === "verse" ? "verse-row" : ""}">
      <td>${s.id}</td>
      <td class="orig">${s.type === "verse" ? s.original + " + تلاوة الآية" : s.original}</td>
      <td class="simp">${s.type === "verse" ? s.verse.text : plainSimple(s.simple)}</td>
      <td>${chip(s)}</td>
    </tr>`).join("");

  // detected verses
  $("#versesList").innerHTML = verses.map(v => `
    <li>
      <div><span class="t">${v.verse.source}</span>
      <span class="s">مطابقة نص المصحف ✓ · التفسير الميسر مرفق</span></div>
      <span class="chip chip-green">مطابقة</span>
    </li>`).join("");

  // linked terms (one pending, to show that state)
  const allTerms = [...termKeys, "العمل الصالح"];
  $("#termsList").innerHTML = allTerms.map(k => {
    const g = GLOSSARY[k];
    const ok = g && g.status === "موثق";
    return `
    <li>
      <div><span class="t">${k}</span>
      <span class="s">${ok ? g.signer : "يُعرض دون مقطع حتى يُوثَّق"}</span></div>
      <span class="chip ${ok ? "chip-green" : "chip-amber"}">${ok ? "موثق" : "قيد التوثيق"}</span>
    </li>`;
  }).join("");

  // next week
  $("#nextTitle").textContent = NEXT_KHUTBAH.title;
  const pct = Math.round((NEXT_KHUTBAH.reviewed / NEXT_KHUTBAH.total) * 100);
  $("#nextProgress").style.width = `${pct}%`;
  $("#nextNote").textContent =
    `المراجعة الشرعية: ${NEXT_KHUTBAH.reviewed} من ${NEXT_KHUTBAH.total} جملة (${pct}٪)`;

  // upload (mock)
  $("#btnUpload").addEventListener("click", () => {
    openModal(`
      <h3>رفع خطبة جديدة</h3>
      <p class="sub">يرفع الإمام نص الخطبة قبل الجمعة، فيبدأ التيسير الآلي ثم المراجعة الشرعية.</p>
      <div class="dropzone">اسحب ملف الخطبة هنا أو اضغط للاختيار<br /><small>(محاكاة — لن يُرفع ملف فعلي)</small></div>
      <button class="btn btn-primary" id="mockUploadBtn">رفع الخطبة</button>
    `);
    $("#mockUploadBtn").addEventListener("click", () => {
      closeModal();
      showToast("استُلمت الخطبة وبدأ التيسير الآلي… ستصل للمراجعة الشرعية خلال دقائق");
    });
  });
})();
