// live khutbah screen: playback engine simulating the full pipeline —
// digital sign interpreter + synced text + worshipper-language translation

const ManbarScreen = (() => {
  const IMPROV_DELAY = 2.5; // extra latency in improvised mode (s)
  const FONT_SIZES = ["s", "m", "l"];
  const SPEEDS = [1, 1.5, 2];

  const stage = $("#screenStage");
  const els = {
    prevLine: $("#prevLine"),
    currentLine: $("#currentLine"),
    verseCard: $("#verseCard"),
    verseText: $("#verseText"),
    verseSource: $("#verseSource"),
    verseTafsir: $("#verseTafsir"),
    unrevBadge: $("#unrevBadge"),
    reviewNote: $("#reviewNote"),
    signerVideo: $("#signerVideo"),
    signerIdle: $("#signerIdle"),
    signerFlag: $("#signerFlag"),
    signerTag: $("#signerTag"),
    asrWords: $("#asrWords"),
    progressBar: $("#progressBar"),
    progressWrap: $("#progressWrap"),
    timeLabel: $("#timeLabel"),
    syncWidget: $("#syncWidget"),
    syncVal: $("#syncVal"),
    waveform: $("#waveform"),
    liveDot: $("#liveDot"),
    liveLabel: $("#liveLabel"),
    noiseOverlay: $("#noiseOverlay"),
    startOverlay: $("#startOverlay"),
    mosqueList: $("#mosqueList"),
    endOverlay: $("#endOverlay"),
    endSummary: $("#endSummary"),
    btnPlay: $("#btnPlay"),
    iconPlay: $("#iconPlay"),
    iconPause: $("#iconPause"),
    btnSpeed: $("#btnSpeed"),
    btnNoise: $("#btnNoise")
  };

  let t = 0; // playback clock, seconds
  let playing = false;
  let started = false;
  let speedIdx = 0;
  let mode = "prepared"; // prepared | improvised
  let lang = "ar";       // ar | en
  let noiseUntil = -1;
  let shownSegId = null;
  let timer = null;
  let syncTimer = null;

  const total = KHUTBAH.duration;

  function segAt(time) {
    return KHUTBAH.segments.find(s => time >= s.t && time < s.t + s.d) || null;
  }

  // mosque picker inside the start overlay
  els.mosqueList.innerHTML = MOSQUES.map(m => `
    <button class="mosque-card ${m.live ? "live" : ""}" ${m.live ? "" : "disabled"}>
      <span class="mosque-name">${m.name} <small>· ${m.city}</small></span>
      ${m.live
        ? `<span class="mosque-status on"><i></i> مباشر الآن — ${m.khutbah}</span>`
        : `<span class="mosque-status">لا بث الآن</span>`}
    </button>`).join("");
  els.mosqueList.querySelector(".mosque-card.live").addEventListener("click", () => play());

  /* ---- rendering ---- */
  function renderSegment(seg) {
    const prev = seg ? KHUTBAH.segments[KHUTBAH.segments.indexOf(seg) - 1] : null;
    els.prevLine.textContent = prev
      ? (lang === "en"
          ? (prev.type === "verse" ? prev.verse.source : prev.en)
          : (prev.type === "verse" ? prev.verse.source : plainSimple(prev.simple)))
      : "";

    if (!seg) {
      els.currentLine.textContent = lang === "en" ? "Waiting for the khutbah…" : "بانتظار بدء الخطبة…";
      els.verseCard.hidden = true;
      return;
    }

    const improvised = mode === "improvised";
    els.unrevBadge.hidden = !(improvised && seg.type !== "verse");
    els.unrevBadge.textContent = lang === "en" ? "Machine translation — not yet reviewed" : "نص آلي غير مُراجَع";
    els.reviewNote.textContent = improvised
      ? "وضع الخطبة المرتجلة: ترجمة مباشرة بتأخير بسيط، والآيات تُطابَق مع المصحف كما هي"
      : "فيديو الإشارة والجمل الميسّرة اعتُمدا قبل الجمعة ✓";

    if (seg.type === "verse") {
      els.currentLine.innerHTML = lang === "en" ? seg.en : seg.original;
      els.verseText.textContent = seg.verse.text;
      els.verseSource.textContent = seg.verse.source + " · تُعرض كما هي من المصحف";
      els.verseTafsir.textContent = lang === "en" ? seg.verse.en : seg.verse.tafsir;
      els.verseTafsir.classList.toggle("en-tafsir", lang === "en");
      els.verseCard.hidden = false;
    } else {
      els.currentLine.innerHTML = lang === "en" ? seg.en : renderSimple(seg.simple);
      els.verseCard.hidden = true;
    }

    // digital interpreter clip for this segment
    if (seg.sign && !els.signerVideo.src.endsWith(seg.sign)) {
      els.signerVideo.src = seg.sign;
    }
    if (playing) els.signerVideo.play().catch(() => {});
  }

  function renderAsr(time) {
    if (inNoise()) { els.asrWords.textContent = "… … … (إشارة صوتية ضعيفة)"; return; }
    const seg = segAt(time);
    if (!seg) { els.asrWords.textContent = "—"; return; }
    const words = seg.original.split(" ");
    const frac = Math.min(1, (time - seg.t) / (seg.d * 0.85));
    const n = Math.max(1, Math.round(words.length * frac));
    els.asrWords.textContent = words.slice(0, n).join(" ") + (frac < 1 ? " …" : "");
  }

  function renderProgress() {
    els.progressBar.style.width = `${(t / total) * 100}%`;
    els.timeLabel.textContent = `${fmtTime(t)} / ${fmtTime(total)}`;
  }

  function renderSync() {
    if (!playing) return;
    if (inNoise()) {
      els.syncVal.textContent = "متوقف";
      els.syncWidget.classList.add("warn");
      return;
    }
    if (mode === "improvised") {
      els.syncVal.textContent = "وضع مرتجل";
      els.syncWidget.classList.add("warn");
    } else {
      els.syncVal.textContent = `${94 + Math.floor(Math.random() * 5)}٪`;
      els.syncWidget.classList.remove("warn");
    }
  }

  function inNoise() { return t < noiseUntil; }

  /* ---- engine ---- */
  function tick() {
    t += 0.1 * SPEEDS[speedIdx];
    if (t >= total) { finish(); return; }

    const noise = inNoise();
    els.noiseOverlay.hidden = !noise;
    els.waveform.classList.toggle("flat", noise);
    stage.classList.toggle("noisy", noise);
    if (noise) els.signerVideo.pause();

    if (!noise) {
      const effT = Math.max(0, t - (mode === "improvised" ? IMPROV_DELAY : 0));
      const seg = segAt(effT);
      const segId = seg ? seg.id : null;
      if (segId !== shownSegId) {
        shownSegId = segId;
        els.currentLine.classList.add("fading");
        setTimeout(() => {
          renderSegment(seg);
          els.currentLine.classList.remove("fading");
        }, 120);
      } else if (els.signerVideo.paused && els.signerVideo.src) {
        els.signerVideo.play().catch(() => {});
      }
    }
    renderAsr(t);
    renderProgress();
  }

  function play() {
    if (t >= total) t = 0;
    playing = true;
    started = true;
    els.startOverlay.hidden = true;
    els.endOverlay.hidden = true;
    els.signerIdle.hidden = true;
    els.iconPlay.toggleAttribute("hidden", true);
    els.iconPause.toggleAttribute("hidden", false);
    els.liveDot.classList.remove("paused");
    els.waveform.classList.remove("idle");
    els.liveLabel.textContent = "مباشر";
    els.signerVideo.play().catch(() => {});
    clearInterval(timer); timer = setInterval(tick, 100);
    clearInterval(syncTimer); syncTimer = setInterval(renderSync, 1000);
    renderSync();
  }

  function pause(label = "متوقف مؤقتاً") {
    playing = false;
    els.iconPlay.toggleAttribute("hidden", false);
    els.iconPause.toggleAttribute("hidden", true);
    els.liveDot.classList.add("paused");
    els.waveform.classList.add("idle");
    els.liveLabel.textContent = label;
    els.signerVideo.pause();
    clearInterval(timer);
    clearInterval(syncTimer);
  }

  function finish() {
    pause("انتهت الخطبة");
    t = total;
    renderProgress();
    const verses = KHUTBAH.segments.filter(s => s.type === "verse").length;
    const termCount = new Set(KHUTBAH.segments.flatMap(s => s.terms || [])).size;
    els.endSummary.textContent =
      `ترجمة إشارية متزامنة كاملة · ${KHUTBAH.segments.length} جملة ميسّرة · ${verses} آيتان بنص المصحف · ${termCount} مفردات إشارة · ترجمة بلغة المصلي`;
    els.endOverlay.hidden = false;
  }

  function seek(frac) {
    t = frac * total;
    noiseUntil = -1;
    shownSegId = undefined;
    els.endOverlay.hidden = true;
    if (!playing && started) { renderSegment(segAt(t)); renderAsr(t); renderProgress(); }
  }

  function restart() {
    t = 0; noiseUntil = -1; shownSegId = undefined;
    els.endOverlay.hidden = true;
    play();
  }

  /* ---- controls ---- */
  $("#btnReplay").addEventListener("click", restart);
  $("#btnRestart").addEventListener("click", restart);
  els.btnPlay.addEventListener("click", () => {
    if (!started) { play(); return; }
    playing ? pause() : play();
  });

  els.btnSpeed.addEventListener("click", () => {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    els.btnSpeed.textContent = `×${SPEEDS[speedIdx]}`;
  });

  els.progressWrap.addEventListener("click", e => {
    const r = els.progressWrap.getBoundingClientRect();
    seek(1 - (e.clientX - r.left) / r.width); // bar fills right-to-left
  });

  $$("#modeToggle button").forEach(btn => {
    btn.addEventListener("click", () => {
      mode = btn.dataset.mode;
      stage.dataset.mode = mode;
      $$("#modeToggle button").forEach(b => b.classList.toggle("on", b === btn));
      els.signerFlag.hidden = mode !== "improvised";
      els.signerTag.textContent = mode === "improvised" ? "المترجم الرقمي · تجريبي" : "المترجم الرقمي";
      shownSegId = undefined; // force re-render
      showToast(mode === "improvised"
        ? "النسخة التجريبية: ترجمة مباشرة بتأخير، والكلمة خارج المفردات تُهجّى بالأصابع"
        : "الوضع الأساسي: فيديو الإشارة مولَّد ومعتمد قبل الجمعة");
    });
  });

  $$("#langToggle button:not([disabled])").forEach(btn => {
    btn.addEventListener("click", () => {
      lang = btn.dataset.lang;
      stage.dataset.lang = lang;
      $$("#langToggle button").forEach(b => b.classList.toggle("on", b === btn));
      shownSegId = undefined; // force re-render in the new language
      if (!playing && started) renderSegment(segAt(Math.max(0, t - (mode === "improvised" ? IMPROV_DELAY : 0))));
      showToast(lang === "en"
        ? "Worshipper language: live translation with approved verse translations"
        : "لغة العرض: العربية الميسّرة");
    });
  });

  els.btnNoise.addEventListener("click", () => {
    if (!playing) { showToast("ابدأ البث أولاً"); return; }
    noiseUntil = t + 5;
    showToast("محاكاة: ضجيج وصدى في الصوت لمدة 5 ثوانٍ");
  });

  $("#btnFontPlus").addEventListener("click", () => bumpFont(1));
  $("#btnFontMinus").addEventListener("click", () => bumpFont(-1));
  function bumpFont(dir) {
    const i = FONT_SIZES.indexOf(stage.dataset.fontsize);
    stage.dataset.fontsize = FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, i + dir))];
  }

  $("#btnFullscreen").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.requestFullscreen?.();
  });

  document.addEventListener("keydown", e => {
    if (document.body.dataset.view !== "screen" || e.target.closest("input,textarea")) return;
    if (e.code === "Space") { e.preventDefault(); started && (playing ? pause() : play()); }
  });

  // router calls this when leaving the view
  function suspend() { if (playing) pause(); }

  els.waveform.classList.add("idle");
  els.liveDot.classList.add("paused");

  return { suspend };
})();
window.ManbarScreen = ManbarScreen;
