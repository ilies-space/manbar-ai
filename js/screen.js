// mosque screen: playback engine that simulates the live khutbah pipeline

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
    termSide: $("#termSide"),
    termClipName: $("#termClipName"),
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
  let noiseUntil = -1;
  let shownSegId = null;
  let timer = null;
  let syncTimer = null;

  const total = KHUTBAH.duration;

  // segment lookup
  function segAt(time) {
    return KHUTBAH.segments.find(s => time >= s.t && time < s.t + s.d) || null;
  }

  // rendering
  function renderSegment(seg) {
    const prev = seg ? KHUTBAH.segments[KHUTBAH.segments.indexOf(seg) - 1] : null;
    els.prevLine.textContent = prev
      ? (prev.type === "verse" ? prev.verse.source : plainSimple(prev.simple))
      : "";

    if (!seg) {
      els.currentLine.textContent = "بانتظار بدء الخطبة…";
      els.verseCard.hidden = true;
      els.termSide.hidden = true;
      return;
    }

    const improvised = mode === "improvised";
    els.unrevBadge.hidden = !(improvised && seg.type !== "verse");
    els.reviewNote.textContent = improvised
      ? "وضع الخطبة المرتجلة: تحويل مباشر بتأخير بسيط، والآيات تُطابَق مع المصحف كما هي"
      : "الجمل الميسّرة رُوجعت شرعياً قبل الجمعة ✓";

    if (seg.type === "verse") {
      els.currentLine.innerHTML = seg.original;
      els.verseText.textContent = seg.verse.text;
      els.verseSource.textContent = seg.verse.source + " · تُعرض كما هي من المصحف";
      els.verseTafsir.textContent = seg.verse.tafsir;
      els.verseCard.hidden = false;
    } else {
      els.currentLine.innerHTML = renderSimple(seg.simple);
      els.verseCard.hidden = true;
    }

    if (seg.terms && seg.terms.length) {
      els.termClipName.textContent = seg.terms[0];
      $("#termClip").dataset.term = seg.terms[0];
      els.termSide.hidden = false;
    } else {
      els.termSide.hidden = true;
    }
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

  // engine
  function tick() {
    t += 0.1 * SPEEDS[speedIdx];
    if (t >= total) { finish(); return; }

    const noise = inNoise();
    els.noiseOverlay.hidden = !noise;
    els.waveform.classList.toggle("flat", noise);

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
    els.iconPlay.toggleAttribute("hidden", true);
    els.iconPause.toggleAttribute("hidden", false);
    els.liveDot.classList.remove("paused");
    els.waveform.classList.remove("idle");
    els.liveLabel.textContent = "مباشر";
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
      `${KHUTBAH.segments.length} جملة ميسّرة · ${verses} آيتان بنص المصحف · ${termCount} مصطلحات بإشاراتها الموثّقة`;
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

  // controls
  $("#btnStart").addEventListener("click", play);
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
      shownSegId = undefined; // force re-render
      showToast(mode === "improvised"
        ? "الوضع الاحتياطي: نص آلي بتأخير بسيط ووسم واضح"
        : "الوضع الأساسي: خطبة مجهّزة ومراجَعة مسبقاً");
    });
  });

  els.btnNoise.addEventListener("click", () => {
    if (!playing) { showToast("شغّل المحاكاة أولاً"); return; }
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
