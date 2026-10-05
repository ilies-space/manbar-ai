// Product flow: onboarding (mosque -> khutbah upload -> go live), the QR
// hand-off from the mosque screen (TV) to the worshipper's phone, and the
// phone viewer's auto-follow loop.

const $ = s => document.querySelector(s);

export function getMosques() {
  return typeof MOSQUES !== "undefined" ? MOSQUES : [{ name: "مسجد النور", city: "الرياض", live: true }];
}

// ---- QR -------------------------------------------------------------------
export async function buildMobileUrl(mosqueIdx) {
  let origin = location.origin;
  if (/^(localhost|127\.|\[::1\])/.test(location.hostname)) {
    try {
      const h = await fetch("/api/health", { signal: AbortSignal.timeout(1500) }).then(r => r.json());
      if (h.ip) origin = `http://${h.ip}${location.port ? ":" + location.port : ""}`;
    } catch {}
  }
  return `${origin}/?view=mobile&m=${mosqueIdx}`;
}

export function renderQr(el, url, cells = 0) {
  if (typeof qrcode === "undefined") { el.textContent = url; return; }
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  el.innerHTML = qr.createSvgTag({ scalable: true, margin: 2 });
}

// ---- onboarding -------------------------------------------------------------
export function runOnboarding() {
  return new Promise(resolve => {
    const overlay = $("#onboard");
    const panes = [...overlay.querySelectorAll(".ob-step")];
    const dots = [...overlay.querySelectorAll(".ob-dot")];
    const mosques = getMosques();
    let mosqueIdx = mosques.findIndex(m => m.live);

    function show(i) {
      panes.forEach((p, j) => p.hidden = j !== i);
      dots.forEach((d, j) => d.classList.toggle("on", j <= i));
    }

    // step 1 — mosque (photo cards)
    const list = $("#obMosques");
    list.className = "mosque-pick";
    list.innerHTML = "";
    mosques.forEach((m, i) => {
      const b = document.createElement("button");
      b.className = "mosque-photo" + (m.live ? " live" : "");
      b.innerHTML =
        `<img src="${m.img}" alt="${m.name}" loading="lazy" />` +
        `<span class="mp-shade"></span>` +
        `<span class="mp-info"><strong>${m.name}</strong><small>${m.city}</small></span>` +
        (m.live ? `<span class="mp-live"><i></i> خطبة اليوم</span>` : "");
      if (!m.live) b.disabled = true;
      b.addEventListener("click", () => { mosqueIdx = i; show(1); });
      list.appendChild(b);
    });

    // step 2 — khutbah upload (.txt is really ingested; other formats fall
    // back to the pre-staged khutbah, labeled)
    let customKhutbah = null;
    const fileInput = $("#obFile");
    const drop = $("#obDrop");

    async function ingest(file) {
      if (!file) return;
      if (/\.txt$/i.test(file.name)) {
        const text = await file.text();
        const sentences = text.split(/[\n.!؟]+/).map(s => s.trim()).filter(s => s.length >= 8);
        if (sentences.length >= 2) {
          customKhutbah = { title: file.name.replace(/\.txt$/i, ""), sentences };
          return startPipeline(`«${customKhutbah.title}» — ${sentences.length} جملة من الملف`);
        }
      }
      startPipeline(`${file.name} (تنسيق غير مدعوم في العرض — تُستخدم خطبة اليوم المجهّزة)`);
    }

    // the zone itself is drag&drop only; browsing goes through the explicit link
    $("#obBrowse").addEventListener("click", e => { e.stopPropagation(); fileInput.click(); });
    fileInput.addEventListener("change", () => ingest(fileInput.files[0]));
    for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, e => {
      e.preventDefault(); drop.classList.add("over");
    });
    for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, e => {
      e.preventDefault(); drop.classList.remove("over");
    });
    drop.addEventListener("drop", e => ingest(e.dataTransfer?.files?.[0]));

    $("#obUseToday").addEventListener("click", () => startPipeline(null));

    async function startPipeline(label) {
      $("#obUploadUi").hidden = true;
      const pipe = $("#obPipe");
      pipe.hidden = false;
      $("#obPipeTitle").textContent = label ? `خطبة: ${label}` : `خطبة اليوم: «${KHUTBAH.title}»`;
      const steps = [...pipe.querySelectorAll("li")];
      for (const li of steps) {
        li.classList.add("busy");
        await new Promise(r => setTimeout(r, 520 + Math.random() * 280));
        li.classList.remove("busy");
        li.classList.add("done");
      }
      await new Promise(r => setTimeout(r, 450));
      show(2);
      prepStep3();
    }

    // step 3 — go live + QR
    async function prepStep3() {
      const m = mosques[mosqueIdx];
      const title = customKhutbah ? customKhutbah.title : KHUTBAH.title;
      const n = customKhutbah ? customKhutbah.sentences.length : KHUTBAH.segments.length;
      $("#obSummary").innerHTML =
        `<strong>${m.name}</strong> · خطبة «${title}» · ${n} جملة مجهّزة` +
        `<br /><small class="ob-sim">الاعتماد الشرعي واعتماد المترجم: محاكاة لأغراض العرض — الحركات أولية بانتظار مترجم معتمد</small>`;
      const url = await buildMobileUrl(mosqueIdx);
      renderQr($("#obQr"), url);
      $("#obQrUrl").textContent = url.replace(/^https?:\/\//, "");
    }

    $("#obBack2").addEventListener("click", () => show(0));
    const skip = $("#obSkip");
    if (skip) skip.addEventListener("click", () => {
      overlay.classList.add("gone");
      setTimeout(() => overlay.remove(), 350);
      resolve({ mosque: mosques[mosqueIdx], mosqueIdx, khutbah: null });
    });
    $("#obStart").addEventListener("click", () => {
      overlay.classList.add("gone");
      setTimeout(() => overlay.remove(), 450);
      resolve({ mosque: mosques[mosqueIdx], mosqueIdx, khutbah: customKhutbah });
    });

    show(0);
  });
}

// ---- after go-live: persistent corner QR + header badge ---------------------
export async function markLive({ mosque, mosqueIdx, khutbah }) {
  $("#mosqueBadge").textContent = `${mosque.name} · ${(khutbah || KHUTBAH).title}`;
  $("#mosqueBadge").hidden = false;
  const url = await buildMobileUrl(mosqueIdx);
  renderQr($("#qrBox"), url);
  return url;
}

// ---- phone viewer ------------------------------------------------------------
export function enterMobileMode(mosqueIdx) {
  document.body.classList.add("mobile-viewer");
  const m = getMosques()[mosqueIdx] || getMosques()[0];
  $("#mobileBar").hidden = false;
  $("#mobileMosque").textContent = m.name;
  return m;
}

export async function mobileFollowLoop(perform, playerBusy, onSentence, shouldStop = () => false) {
  const sentences = KHUTBAH.segments.map(s => s.type === "verse" ? `${s.original} ${s.verse.text}` : s.original);
  for (;;) {
    for (let i = 0; i < sentences.length; i++) {
      if (shouldStop()) return;        // the screen's live session took over
      onSentence(i, sentences.length);
      await perform(sentences[i]);
      await new Promise(r => setTimeout(r, 600));
      while (playerBusy() && !shouldStop()) await new Promise(r => setTimeout(r, 300));
      await new Promise(r => setTimeout(r, 900));
      if (shouldStop()) return;
    }
  }
}
