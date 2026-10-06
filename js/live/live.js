// المترجم الحي — app glue: stage + player + translate + mic

import { createStage } from "./scene.js";
import { buildRig } from "./rig.js";
import { SignPlayer } from "./player.js";
import { Translator, normalizeAr, ruleTranslate, needsNegationReview, negatedTranslate } from "./translate.js";
import { versesIn, ayahTranslation } from "./quran.js";
import { pickAdapter } from "./asr.js";
import { runOnboarding, markLive, getMosques } from "./flow.js";
import { getSettings, saveSettings } from "./api.js";

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
// public mode (deaf worshipper) is the default; the imam mode is an option inside the app
const IS_IMAM = params.get("mode") === "imam";
document.body.classList.toggle("mode-imam", IS_IMAM);
document.body.classList.toggle("mode-public", !IS_IMAM);
let imamToken = sessionStorage.getItem("manbar.imamToken") || "";

const state = {
  mode: "prepared",          // prepared | improvised (mic path)
  pointer: -1,               // prepared-khutbah tracking pointer
  adapter: null,
  micOn: false
};

async function boot() {
  // onboarding is pure UI — run it while the character/lexicon load so the
  // user is never stuck staring at an empty card if an asset is slow
  const isDebug = params.get("wp") || params.get("sign");
  if (!IS_IMAM || isDebug) { document.querySelector("#onboard")?.remove(); document.querySelector("#login")?.remove(); }
  const onboardingPromise = (IS_IMAM && !isDebug) ? imamLogin().then(() => runOnboarding()) : null;

  const [stage, signs, handshapes] = await Promise.all([
    createStage($("#stage3d"), { controls: params.has("controls") }),
    // team placeholder signs + 501 KArSL signs recorded by human signers
    Promise.all([
      fetch("assets/lexicon/signs.json").then(r => r.json()),
      fetch("assets/lexicon/signs_karsl.json").then(r => r.json()).catch(() => ({}))
    ]).then(([a, b]) => { delete b._note; return Object.assign(a, b); }),
    fetch("assets/lexicon/handshapes.json").then(r => r.json())
  ]);
  delete signs._note;

  const rig = buildRig(stage.character);
  const player = new SignPlayer(rig, signs, handshapes, stage.character);
  stage.onTick(dt => player.update(dt));

  const translator = new Translator();
  await translator.init();

  window.__manbar = { stage, rig, player, translator, signs };

  // status chips
  $("#chipVocab").textContent = `${Object.keys(signs).length} إشارة`;
  $("#chipFingers").textContent = rig.hasFingers ? "أصابع: نعم" : "أصابع: قريباً";
  $("#chipEngine").textContent = translator.serverKey
    ? (translator.api?.name === "n8n" ? "ترجمة: OpenAI عبر n8n" : "ترجمة: OpenAI محلي")
    : "ترجمة: قاموس محلي";
  setInterval(() => { $("#chipFps").textContent = `${stage.getFps()} fps`; }, 1200);

  // waypoint probe: index.html?wp=0.2,0.05,0.35,forward   (right hand xyz+palm)
  // or both hands:  ?wp=0.2,0.05,0.35,up|-0.2,-0.1,0.3,in
  if (params.get("wp")) {
    const parse = seg => {
      const bits = seg.split(",");
      return { p: bits.slice(0, 3).map(Number), palm: bits[3] || "in", hand: bits[4] || "flat" };
    };
    const segs = params.get("wp").split("|").map(parse);
    const pose = { R: segs[0].p, palmR: segs[0].palm, handR: segs[0].hand, handL: "rest" };
    if (segs[1]) { pose.L = segs[1].p; pose.palmL = segs[1].palm; pose.handL = segs[1].hand; }
    document.querySelector("#onboard")?.remove();
    player.testPose(pose);
    $("#caption").textContent = params.get("wp");
    return;
  }

  // debug freeze: index.html?sign=GLOSS_DUA&t=0.7
  if (params.get("sign")) {
    document.querySelector("#onboard")?.remove();
    player.freeze(params.get("sign"), parseFloat(params.get("t") || "0.6"));
    $("#caption").textContent = params.get("sign");
    return;
  }

  // ---- gloss strip + caption ---------------------------------------------
  let chips = [];
  player.onItem = item => {
    chips.forEach(c => c.classList.remove("on"));
    if (!item) { $("#caption").textContent = ""; return; }
    const i = chips.findIndex(c => !c.dataset.done);
    if (i >= 0) { chips[i].classList.add("on"); chips[i].dataset.done = "1"; }
    $("#caption").textContent = item.kind === "letter"
      ? `تهجئة: ${item.word} — حرف «${item.ch}»`
      : (signs[item.id]?.ar || "");
  };

  function showPlan(items, { flag = false } = {}) {
    const strip = $("#glossStrip");
    strip.innerHTML = "";
    chips = items.map(it => {
      const c = document.createElement("span");
      c.className = "gchip" + (it.kind === "spell" ? " spell" : "");
      c.textContent = it.kind === "spell" ? `تهجئة: ${it.word}` : (signs[it.id]?.ar || it.id);
      strip.appendChild(c);
      return c;
    });
    // expand spells into letter-sized chips? keep one chip per word; letters tick inside it
    $("#flagAuto").hidden = !flag;
  }

  let performanceRequest = 0;

  function performItems(text, items, { flag = false } = {}) {
    $("#mobileSentence").textContent = text;
    $("#mobileSentence").hidden = !text;
    player.clear();
    showPlan(items, { flag });
    if (!items.length) {
      $("#caption").textContent = text;
      $("#srcBadge").textContent = translator.warning || "لا تتوفر إشارات لهذه الجملة";
      $("#flagAuto").hidden = false;
      return;
    }
    player.enqueue(items.slice());
    const map = [];
    items.forEach((it, idx) => {
      if (it.kind === "spell") { for (const _ of [...it.word]) map.push(idx); }
      else map.push(idx);
    });
    let step = -1;
    player.onItem = item => {
      if (!item) { $("#caption").textContent = ""; chips.forEach(c => c.classList.remove("on")); return; }
      step++;
      chips.forEach(c => c.classList.remove("on"));
      const chip = chips[map[step]];
      chip?.classList.add("on");
      $("#caption").textContent = item.kind === "letter"
        ? `تهجئة: ${item.word} — «${item.ch}»`
        : (signs[item.id]?.ar || "");
    };
  }

  function pushLive(event) {
    if (params.get("view") === "mobile") return;
    fetch("/api/live/push", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ m: state.mosqueIdx ?? 0, event })
    }).catch(() => {});
  }

  async function perform(text, { flag = false } = {}) {
    const request = ++performanceRequest;
    const items = await translator.translate(text);
    if (request !== performanceRequest) return;
    $("#chipEngine").textContent = translator.lastSource === "review"
      ? "ترجمة: بحاجة إلى مراجعة"
      : translator.lastSource === "rules"
      ? "ترجمة: قاموس محلي"
      : (translator.api?.name === "n8n" ? "ترجمة: OpenAI عبر n8n" : "ترجمة: OpenAI محلي");
    performItems(text, items, { flag });
    pushLive({ type: "perform", text, items, flag });
    $("#srcBadge").textContent =
      translator.lastSource === "api" ? "ترجمة نموذج لغوي" :
      translator.lastSource === "cache" ? "من الذاكرة" : "قاموس محلي";
  }


  // ---- verses: official mushaf text; the avatar announces «القرآن الكريم · آية» then signs the meaning
  // of the approved tafsir (التفسير الميسر, King Fahd Complex) — never the words of the ayah one by one
  function verseItems(ayat) {
    const items = [{ kind: "gloss", id: "KARSL_k359" }, { kind: "gloss", id: "KARSL_k397" }];
    const meaning = ayat.map(a => (a.m || "").split(/[.،؛:]/)[0]).join(" ");
    let meaningItems = ruleTranslate(meaning);
    if (needsNegationReview(meaning)) {
      // negated meaning: keep the explicit «لا» sign; if the negated word itself has no sign, sign only «القرآن · آية»
      const neg = negatedTranslate(meaning);
      meaningItems = neg.length && !neg.some(it => it.kind === "spell") ? neg.slice(0, 6) : [];
      if (meaningItems.length && meaningItems[meaningItems.length - 1].id !== "GLOSS_NEG" && !meaningItems.some(it => it.id === "GLOSS_NEG")) meaningItems = [];
    }
    for (const it of meaningItems) if (it.kind === "gloss" && items.length < 8 && items[items.length - 1].id !== it.id) items.push(it);
    return items.filter(it => signs[it.id]);
  }
  async function planFor(text) {
    const ayat = await versesIn(text);
    if (ayat.length) return { ayat, items: verseItems(ayat), source: "verse" };
    return { ayat: [], items: await translator.translate(text), source: translator.lastSource };
  }

  if (IS_IMAM) await runImam(); else await runPublic();

  // ======================================================================
  // IMAM MODE — sign in, choose the mosque, share the khutbah, open the mic
  // ======================================================================
  async function runImam() {
    const sentences = (typeof KHUTBAH !== "undefined" ? KHUTBAH.segments : [])
      .map(s => ({
        text: s.type === "verse" ? `${s.original} ${s.verse.text}` : s.original,
        display: s.type === "verse" ? `${s.original} ﴿…﴾ ${s.verse.source}` : s.original
      }));
    const list = $("#sentenceList");
    function rebuildList() {
      list.innerHTML = "";
      sentences.forEach((s, i) => {
        const li = document.createElement("button");
        li.className = "sent";
        li.textContent = s.display;
        li.addEventListener("click", () => { selectSentence(i); perform(s.text, { mode: "prepared" }); });
        list.appendChild(li);
      });
    }
    function selectSentence(i) {
      state.pointer = i;
      [...list.children].forEach((el, j) => el.classList.toggle("on", j === i));
      list.children[i]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    rebuildList();

    function pushLive(event) {
      fetch("/api/live/push", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Imam-Token": imamToken },
        body: JSON.stringify({ m: state.mosqueIdx ?? 0, event })
      }).catch(() => {});
    }

    function setModeChip(mode) {
      const c = $("#imamMode");
      c.hidden = false;
      c.className = "pill mode-chip " + mode;
      c.textContent = mode === "prepared" ? "خطبة مجهّزة" : "وضع مرتجل — ترجمة فورية";
    }

    async function perform(text, { mode = "prepared" } = {}) {
      const request = ++performanceRequest;
      const plan = await planFor(text);
      if (request !== performanceRequest) return;
      const flag = mode === "improvised";
      $("#chipEngine").textContent = plan.source === "verse" ? "آية: نص المصحف"
        : plan.source === "review" ? "ترجمة: بحاجة إلى مراجعة"
        : plan.source === "negation" ? "ترجمة: قاموس KArSL + إشارة النفي"
        : plan.source === "rules" ? "ترجمة: قاموس KArSL"
        : (translator.api?.name === "n8n" ? "ترجمة: OpenAI عبر n8n" : "ترجمة: OpenAI محلي");
      performItems(text, plan.items, { flag });
      setModeChip(mode);
      pushLive({ type: "perform", id: Date.now(), text, items: plan.items, mode,
        ayat: plan.ayat.map(({ m, ...a }) => a) });
      $("#srcBadge").textContent = plan.source === "verse" ? "آية من المصحف" :
        plan.source === "api" ? "ترجمة نموذج لغوي" : plan.source === "cache" ? "من الذاكرة" : plan.source === "negation" ? "KArSL + «لا»" : "قاموس KArSL";
    }

    // ---- mic: automatic switch between the shared khutbah and improvised speech ----
    const micBtn = $("#btnMic");
    const micStatus = $("#micStatus");
    const transcript = $("#transcript");
    function setMicState(st, detail) {
      micStatus.textContent =
        st === "listening" ? "يستمع…" :
        st === "transcribing" ? "يفرّغ الصوت…" :
        st === "error" ? `خطأ: ${detail || ""}` : "متوقف";
      micStatus.className = "pill " + (st === "listening" ? "ok" : st === "error" ? "bad" : "");
      micStatus.hidden = st === "stopped";
    }
    function matchPrepared(text) {
      const words = new Set(normalizeAr(text).split(" ").filter(w => w.length > 2));
      if (!words.size || !sentences.length) return -1;
      let best = -1, bestScore = 0.6;
      const from = Math.max(0, state.pointer - 1), to = Math.min(sentences.length, Math.max(state.pointer, 0) + 5);
      for (let i = from; i < to; i++) {
        const sw = normalizeAr(sentences[i].text).split(" ").filter(w => w.length > 2);
        if (!sw.length) continue;
        const shared = new Set(sw.filter(w => words.has(w))).size;
        const hit = shared / new Set(sw).size;
        const inputCoverage = shared / words.size;
        if (inputCoverage >= 0.7 && hit > bestScore) { bestScore = hit; best = i; }
      }
      return best;
    }
    async function onFinalText(text) {
      $("#liveWords").textContent = text;
      const line = document.createElement("p");
      line.textContent = text;
      transcript.prepend(line);
      const hit = matchPrepared(text);
      if (hit >= 0) {
        selectSentence(hit);
        line.classList.add("hit");
        await perform(sentences[hit].text, { mode: "prepared" });
        return;
      }
      line.classList.add("auto");
      await perform(text, { mode: "improvised" });
    }
    // the words appear as the imam says them (interim speech results), on his screen and on the worshippers' phones
    let wordsSent = "", wordsTimer = null;
    function liveWords(t) {
      if (t) { const lw = $("#liveWords"); lw.textContent = t; lw.classList.add("speaking"); }
      else $("#liveWords").classList.remove("speaking");
      const sub = $("#mobileSentence");
      if (t) { sub.textContent = t; sub.hidden = false; sub.classList.add("speaking"); }
      else sub.classList.remove("speaking");
      if (wordsTimer) return;
      wordsTimer = setTimeout(() => {
        wordsTimer = null;
        const cur = $("#mobileSentence").classList.contains("speaking") ? $("#mobileSentence").textContent : "";
        if (cur !== wordsSent) { wordsSent = cur; pushLive({ type: "words", text: cur }); }
      }, 250);
    }
    async function startMic() {
      if (!state.micOn) micBtn.click();
    }
    micBtn.addEventListener("click", async () => {
      if (state.micOn) {
        state.adapter?.stop();
        state.micOn = false;
        micBtn.classList.remove("live");
        micBtn.setAttribute("aria-label", "ابدأ الاستماع"); micBtn.title = "ابدأ الاستماع";
        $("#icoMicStart").toggleAttribute("hidden", false); $("#icoMicStop").toggleAttribute("hidden", true);
        return;
      }
      state.adapter = await pickAdapter({
        onText: (t, { final }) => {
          $("#interim").textContent = t;
          if (final) { $("#interim").textContent = ""; liveWords(""); return onFinalText(t); }
          liveWords(t);
        },
        onState: setMicState
      });
      if (!state.adapter) { setMicState("error", "لا يوجد مدخل صوت مدعوم"); return; }
      $("#chipAsr").textContent = state.adapter.name;
      try {
        await state.adapter.start();
        state.micOn = true;
        micBtn.classList.add("live");
        micBtn.setAttribute("aria-label", "أوقف الاستماع"); micBtn.title = "أوقف الاستماع";
        $("#icoMicStart").toggleAttribute("hidden", true); $("#icoMicStop").toggleAttribute("hidden", false);
      } catch (e) { setMicState("error", e.name === "NotAllowedError" ? "رفض إذن الميكروفون" : e.message); }
    });
    setInterval(() => {
      const lv = state.adapter?.level?.() || 0;
      $("#vu").style.width = `${Math.min(100, lv * 240)}%`;
    }, 120);

    // ---- onboarding (mosque -> khutbah -> share) ----
    const setup = await onboardingPromise;
    state.mosqueIdx = setup.mosqueIdx;
    if (setup.khutbah) {
      sentences.length = 0;
      setup.khutbah.sentences.forEach(t => sentences.push({ text: t, display: t }));
      rebuildList();
    }
    await markLive(setup);
    // «مشاركة الخطبة»: the worshippers' devices switch to the prepared khutbah automatically
    pushLive({ type: "khutbah", title: (setup.khutbah || KHUTBAH).title, n: sentences.length, mosque: setup.mosque?.name });
    document.body.classList.remove("panel-closed");
    $("#qrToggle").hidden = false;
    $("#qrToggle").addEventListener("click", () => { $("#qrCard").hidden = !$("#qrCard").hidden; });
    $("#qrCard").addEventListener("click", () => { $("#qrCard").hidden = true; });
    $("#panelHandle")?.addEventListener("click", () => document.body.classList.toggle("panel-closed"));
    window.addEventListener("beforeunload", () => pushLive({ type: "end" }));
    startMic();
  }

  // ======================================================================
  // PUBLIC MODE (default) — the deaf worshipper's screen
  // ======================================================================
  async function runPublic() {
    const mIdx = parseInt(params.get("m") || "0", 10) || 0;
    const mosque = getMosques()[mIdx] || getMosques()[0];
    const status = $("#pubStatus");
    const setStatus = t => { status.textContent = t; };
    $("#mosqueHere").innerHTML = `<span class="mh-dot"></span>أنت الآن في <strong>${String(mosque.name).replace(/[&<>"]/g, "")}</strong>${mosque.city ? ` <small>· ${String(mosque.city).replace(/[&<>"]/g, "")}</small>` : ""}`;
    let current = null;          // the line on screen
    let lang = localStorage.getItem("manbar.lang") || "ar";
    $("#langSel").value = lang;

    const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    function renderNow(ev) {
      const box = $("#pubNow");
      if (ev.ayat?.length) {
        box.innerHTML = ev.ayat.map(a =>
          `<div class="ayah"><span class="ayah-t">﴿${esc(a.t)}﴾</span><span class="ayah-ref">${esc(a.ref)}` +
          `${a.partial ? " · اقتبس الإمام جزءاً منها" : ""}${a.also ? " · وردت أيضاً في: " + esc(a.also.join("، ")) : ""}</span></div>`).join("");
      } else {
        box.textContent = ev.text;
      }
    }
    // a chosen language replaces the Arabic: only that language is shown (Arabic text comes back if no translation exists)
    let lastTr = null, curTr = null;
    function applyLang() {
      document.body.classList.toggle("pub-foreign", lang !== "ar");
    }
    async function renderTr(ev) {
      const el = $("#pubTr");
      applyLang();
      el.hidden = true;
      document.body.classList.remove("pub-tr-missing");
      if (lang === "ar" || !ev) { $("#pubPrevTr").textContent = ""; return; }
      const t = await translateLine(ev, lang);
      if (ev !== current) return;
      if (!t) { document.body.classList.add("pub-tr-missing"); return; }
      curTr = t.text;
      el.innerHTML = `${esc(t.text)}<small>${esc(t.src)}</small>`;
      el.className = "pub-tr" + (["ur"].includes(lang) ? "" : " ltr");
      el.hidden = false;
      const pv = $("#pubPrevTr"); pv.textContent = lastTr || ""; pv.className = "pub-prev-tr" + (["ur"].includes(lang) ? "" : " ltr");
    }
    // words of the sentence being spoken right now (before it is complete and translated)
    let wordsShown = false;
    function showWords(t) {
      if (!t) return;
      if (!wordsShown && current) {
        $("#pubPrev").textContent = current.ayat?.length ? current.ayat.map(a => a.ref).join("، ") : current.text;
        if (curTr) { const pv = $("#pubPrevTr"); pv.textContent = curTr; pv.className = "pub-prev-tr" + (["ur"].includes(lang) ? "" : " ltr"); }
        $("#pubTr").hidden = true;
      }
      wordsShown = true;
      const box = $("#pubNow");
      box.innerHTML = `<span class="speaking">${esc(t)}</span>`;
      if (lang !== "ar") { const el = $("#pubTr"); el.className = "pub-tr waiting"; el.innerHTML = `<span class="speaking"></span>`; el.hidden = false; }
      document.body.classList.add("pub-speaking");
    }
    function showLine(ev) {
      wordsShown = false;
      document.body.classList.remove("pub-speaking");
      lastTr = curTr; curTr = null;
      if (current) $("#pubPrev").textContent = current.ayat?.length ? current.ayat.map(a => a.ref).join("، ") : current.text;
      current = ev;
      renderNow(ev);
      const chip = $("#pubMode");
      chip.hidden = false;
      chip.className = "pill mode-chip " + (ev.mode === "improvised" ? "improvised" : "prepared");
      chip.textContent = ev.mode === "improvised" ? "وضع مرتجل — ترجمة آلية فورية" : "خطبة مجهّزة";
      if (ev.items?.length) performItems(ev.text, ev.items, { flag: ev.mode === "improvised" });
      else { player.clear(); $("#caption").textContent = ""; }
      renderTr(ev);
    }
    applyLang();
    $("#langSel").addEventListener("change", e => {
      lang = e.target.value; lastTr = null;
      try { localStorage.setItem("manbar.lang", lang); } catch {}
      renderTr(current);
    });

    // translations: verses from published translations of meanings; sentences machine-translated (labelled)
    const DEMO = {};
    if (typeof KHUTBAH !== "undefined") for (const seg of KHUTBAH.segments) {
      const T = (typeof DEMO_TR !== "undefined" && DEMO_TR[seg.id]) || {};
      DEMO[normalizeAr(seg.original)] = { en: seg.en, ...T };
    }
    async function translateLine(ev, to) {
      if (ev.ayat?.length) {
        const T = (await Promise.all(ev.ayat.map(a => ayahTranslation(to, a.s, a.a)))).filter(Boolean);
        if (T.length) return { text: T.map(t => t.text).join(" "), src: "ترجمة معاني معتمدة: " + T[0].source };
      }
      const pre = DEMO[normalizeAr(ev.text)]?.[to];
      if (pre) return { text: pre, src: "ترجمة آلية مُعدّة مسبقاً" };
      try {
        const r = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: ev.text, to }) });
        if (r.ok) { const d = await r.json(); if (d.text) return { text: d.text, src: "ترجمة آلية فورية" }; }
      } catch {}
      return null;
    }

    // ---- live from the mosque (local server, same Wi-Fi: the QR is scanned inside the mosque) ----
    let live = false;
    try {
      const es = new EventSource(`/api/live/stream?m=${mIdx}`);
      es.onopen = () => { if (!live) setStatus(`متصل بـ${mosque.name} — بانتظار بدء الخطبة`); };
      es.onmessage = ev => {
        try {
          const e = JSON.parse(ev.data);
          if (e.type === "khutbah") { setStatus(`${mosque.name} · خطبة «${e.title}» — شاركها الإمام`); }
          if (e.type === "perform") { live = true; stopDemo(); stopMic(true); setStatus(`بث مباشر — ${mosque.name}`); showLine(e); }
          if (e.type === "words") { live = true; stopDemo(); stopMic(true); setStatus(`بث مباشر — ${mosque.name} · الإمام يتكلم`); showWords(e.text); }
          if (e.type === "end") { live = false; setStatus(`انتهت الخطبة — ${mosque.name}`); }
        } catch {}
      };
      es.onerror = () => { es.close(); if (!live) setStatus("اضغط «الاستماع المباشر» ليستمع جوالك إلى خطبة الإمام، أو «تجربة الاستماع» لخطبة تجريبية"); };
    } catch {
      setStatus("اضغط «الاستماع المباشر» ليستمع جوالك إلى خطبة الإمام، أو «تجربة الاستماع» لخطبة تجريبية");
    }

    // ---- «تجربة الاستماع»: voiced demo khutbah -> signs + written text, sentence by sentence ----
    let demo = null;
    const btn = $("#btnListen");          // real live listening (the phone's microphone)
    const demoBtn = $("#btnDemo");        // recorded demo khutbah
    const DEMO_LABEL = "🎧 تجربة الاستماع", LIVE_LABEL = "🎙 الاستماع المباشر";
    function stopDemo() {
      if (!demo) return;
      demo.stop = true; demo.audio?.pause();
      demo = null;
      if (demoBtn) { demoBtn.classList.remove("on"); demoBtn.textContent = DEMO_LABEL; }
    }
    demoBtn?.addEventListener("click", () => { if (demo) stopDemo(); else { stopMic(); startDemo(); } });
    async function startDemo() {
      const me = demo = { stop: false, audio: null };
      if (demoBtn) { demoBtn.classList.add("on"); demoBtn.textContent = "⏹ إيقاف التجربة"; }
      const segs = KHUTBAH.segments;
      for (let i = 0; i < segs.length && !me.stop; i++) {
        setStatus(`عرض تجريبي · خطبة «${KHUTBAH.title}» · ${i + 1}/${segs.length}`);
        const seg = segs[i];
        const text = seg.type === "verse" ? `${seg.original} ${seg.verse.text}` : seg.original;
        let audioDone = false;
        const audio = me.audio = new Audio(`assets/audio/khutbah_${String(i + 1).padStart(2, "0")}.mp3`);
        audio.onended = () => (audioDone = true);
        audio.onerror = () => (audioDone = true);
        const plan = await planFor(text);
        if (me.stop) break;
        audio.play().catch(() => (audioDone = true));
        showLine({ id: "demo" + i, text, items: plan.items, ayat: plan.ayat, mode: "prepared" });
        const t0 = Date.now();
        await new Promise(r => setTimeout(r, 700));
        while (!me.stop && (!audioDone || player.busy) && Date.now() - t0 < 45000) await new Promise(r => setTimeout(r, 200));
        await new Promise(r => setTimeout(r, 450));
      }
      if (demo === me) { stopDemo(); setStatus("انتهت الخطبة التجريبية — اضغط «تجربة الاستماع» لإعادتها"); }
    }

    // ---- «الاستماع المباشر» (real): the worshipper's phone listens to the mosque loudspeaker ----
    // speech -> words on screen as they are said; each finished sentence is matched with the khutbah
    // (prepared signs) or translated on the fly and labelled «وضع مرتجل»
    let mic = null, micBusy = false, pointer = -1, heard = Promise.resolve();
    const kSegs = typeof KHUTBAH !== "undefined" ? KHUTBAH.segments : [];
    const segText = sg => sg.type === "verse" ? `${sg.original} ${sg.verse.text}` : sg.original;
    function matchKhutbah(text) {
      const words = new Set(normalizeAr(text).split(" ").filter(w => w.length > 2));
      if (!words.size) return -1;
      let best = -1, bestScore = 0.55;
      for (let i = 0; i < kSegs.length; i++) {
        const sw = normalizeAr(segText(kSegs[i])).split(" ").filter(w => w.length > 2);
        if (!sw.length) continue;
        const shared = new Set(sw.filter(w => words.has(w))).size;
        const hit = shared / new Set(sw).size, coverage = shared / words.size;
        const near = pointer < 0 || (i >= pointer - 1 && i <= pointer + 4) ? 0.05 : 0;
        if (coverage >= 0.6 && hit + near > bestScore) { bestScore = hit + near; best = i; }
      }
      return best;
    }
    function onHeard(text) {
      heard = heard.then(async () => {
        if (!mic || !text.trim()) return;
        const hit = matchKhutbah(text);
        let t = text, mode = "improvised";
        if (hit >= 0) { pointer = hit; t = segText(kSegs[hit]); mode = "prepared"; }
        const plan = await planFor(t);
        if (!mic) return;
        showLine({ id: "mic" + Date.now(), text: t, items: plan.items, ayat: plan.ayat, mode });
      }).catch(e => console.warn(e));
    }
    function stopMic(quiet) {
      if (!mic) return;
      const a = mic; mic = null;
      try { a.stop(); } catch {}
      btn.classList.remove("on"); btn.textContent = LIVE_LABEL;
      document.body.classList.remove("pub-speaking");
      if (!quiet) setStatus("توقّف الاستماع — اضغط «الاستماع المباشر» للمتابعة");
    }
    async function startMic() {
      if (micBusy) return;
      micBusy = true;
      try {
        stopDemo();
        const a = await pickAdapter({
          onText: (t, { final }) => { if (!mic) return; if (final) { onHeard(t); return; } showWords(t); },
          onState: (st, detail) => {
            if (!mic) return;
            if (st === "listening") setStatus("يستمع الآن إلى الخطبة — قرّب الجوال من مكبّر الصوت");
            else if (st === "error") setStatus("تعذّر الاستماع: " + (detail || ""));
          }
        });
        if (!a) { setStatus("المتصفح لا يدعم الاستماع المباشر — جرّب Chrome، أو اضغط «تجربة الاستماع»"); return; }
        mic = a;
        btn.classList.add("on"); btn.textContent = "⏹ إيقاف الاستماع";
        setStatus("يستمع الآن إلى الخطبة — قرّب الجوال من مكبّر الصوت");
        await a.start();
      } catch (e) {
        mic = null; btn.classList.remove("on"); btn.textContent = LIVE_LABEL;
        setStatus(e?.name === "NotAllowedError" ? "رُفض إذن الميكروفون — اسمح به من إعدادات المتصفح ثم أعد المحاولة" : "تعذّر فتح الميكروفون: " + (e?.message || e));
      } finally { micBusy = false; }
    }
    btn.addEventListener("click", () => (mic ? stopMic() : startMic()));
  }

  // ---- imam access: opens directly (no username/password screen) ----
  async function imamLogin() {
    if (!imamToken) { imamToken = "open"; try { sessionStorage.setItem("manbar.imamToken", imamToken); } catch {} }
    document.querySelector("#login")?.remove();
    return;
  }
  // ---- settings dialog ----
  const sOverlay = $("#settingsOverlay");
  $("#btnSettings").addEventListener("click", () => {
    const cfg = getSettings();
    $("#setBase").value = cfg.base;
    $("#setKey").value = cfg.key;
    sOverlay.hidden = false;
  });
  $("#setCancel").addEventListener("click", () => { sOverlay.hidden = true; });
  sOverlay.addEventListener("click", e => { if (e.target === sOverlay) sOverlay.hidden = true; });
  $("#setKeyEye").addEventListener("click", () => {
    const k = $("#setKey");
    k.type = k.type === "password" ? "text" : "password";
    $("#setKeyEye").textContent = k.type === "password" ? "إظهار" : "إخفاء";
  });
  $("#setSave").addEventListener("click", () => {
    saveSettings({ base: $("#setBase").value, key: $("#setKey").value });
    location.reload();
  });
  $("#setClear").addEventListener("click", () => {
    saveSettings({ base: "", key: "" });
    location.reload();
  });
}

boot().catch(e => {
  console.error(e);
  const msg = "تعذر تحميل المشهد: " + (e?.message || e);
  const card = document.querySelector("#onboard .ob-card");
  if (card) {
    const box = document.createElement("div");
    box.className = "ob-error";
    box.innerHTML = `<p>${msg}</p><button class="btn btn-gold" onclick="location.reload()">إعادة المحاولة</button>`;
    card.appendChild(box);
  }
  const el = document.querySelector("#bootError");
  if (el) { el.hidden = false; el.textContent = msg; }
});
