// المترجم الحي — app glue: stage + player + translate + mic

import { createStage } from "./scene.js";
import { buildRig } from "./rig.js";
import { SignPlayer } from "./player.js";
import { Translator, normalizeAr } from "./translate.js";
import { pickAdapter } from "./asr.js";
import { runOnboarding, markLive, enterMobileMode, mobileFollowLoop } from "./flow.js";

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);

const state = {
  mode: "prepared",          // prepared | improvised (mic path)
  pointer: -1,               // prepared-khutbah tracking pointer
  adapter: null,
  micOn: false
};

async function boot() {
  // onboarding is pure UI — run it while the character/lexicon load so the
  // user is never stuck staring at an empty card if an asset is slow
  const isMobileView = params.get("view") === "mobile";
  const isDebug = params.get("wp") || params.get("sign");
  const onboardingPromise = (!isMobileView && !isDebug && document.querySelector("#onboard"))
    ? runOnboarding()
    : null;

  const [stage, signs, handshapes] = await Promise.all([
    createStage($("#stage3d"), { controls: params.has("controls") }),
    fetch("assets/lexicon/signs.json").then(r => r.json()),
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

  // waypoint probe: live.html?wp=0.2,0.05,0.35,forward   (right hand xyz+palm)
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

  // debug freeze: live.html?sign=GLOSS_DUA&t=0.7
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

  // ---- prepared sentences list -------------------------------------------
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
      li.addEventListener("click", () => { selectSentence(i); perform(s.text); });
      list.appendChild(li);
    });
  }
  rebuildList();
  function selectSentence(i) {
    state.pointer = i;
    [...list.children].forEach((el, j) => el.classList.toggle("on", j === i));
    list.children[i]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // ---- mic -------------------------------------------------------------------
  const micBtn = $("#btnMic");
  const micStatus = $("#micStatus");
  const transcript = $("#transcript");

  function setMicState(s, detail) {
    micStatus.textContent =
      s === "listening" ? "يستمع…" :
      s === "transcribing" ? "يفرّغ الصوت…" :
      s === "error" ? `خطأ: ${detail || ""}` : "متوقف";
    micStatus.className = "pill " + (s === "listening" ? "ok" : s === "error" ? "bad" : "");
    micStatus.hidden = s === "stopped";
  }

  function matchPrepared(text) {
    // normalized shared-word ratio against sentences from pointer forward
    const words = new Set(normalizeAr(text).split(" ").filter(w => w.length > 2));
    if (!words.size) return -1;
    let best = -1, bestScore = 0.75;
    for (let i = Math.max(0, state.pointer); i < Math.min(sentences.length, state.pointer + 4 || 4); i++) {
      const sw = normalizeAr(sentences[i].text).split(" ").filter(w => w.length > 2);
      if (!sw.length) continue;
      const shared = new Set(sw.filter(w => words.has(w))).size;
      const hit = shared / new Set(sw).size;
      const inputCoverage = shared / words.size;
      if (inputCoverage >= 0.75 && hit > bestScore) { bestScore = hit; best = i; }
    }
    return best;
  }

  async function onFinalText(text) {
    const line = document.createElement("p");
    line.textContent = text;
    transcript.prepend(line);
    if (state.mode === "prepared") {
      const hit = matchPrepared(text);
      if (hit >= 0) {
        selectSentence(hit);
        line.classList.add("hit");
        await perform(sentences[hit].text);
        return;
      }
    }
    line.classList.add("auto");
    await perform(text, { flag: true });
  }

  micBtn.addEventListener("click", async () => {
    if (state.micOn) {
      state.adapter?.stop();
      state.micOn = false;
      micBtn.classList.remove("live");
      micBtn.setAttribute("aria-label", "ابدأ الاستماع");
      micBtn.title = "ابدأ الاستماع";
      $("#icoMicStart").hidden = false;
      $("#icoMicStop").hidden = true;
      return;
    }
    state.adapter = await pickAdapter({
      onText: (t, { final }) => { $("#interim").textContent = t; if (final) { $("#interim").textContent = ""; return onFinalText(t); } },
      onState: setMicState
    });
    if (!state.adapter) { setMicState("error", "لا يوجد مدخل صوت مدعوم"); return; }
    $("#chipAsr").textContent = state.adapter.name;
    try {
      await state.adapter.start();
      state.micOn = true;
      micBtn.classList.add("live");
      micBtn.setAttribute("aria-label", "أوقف الاستماع");
      micBtn.title = "أوقف الاستماع";
      $("#icoMicStart").hidden = true;
      $("#icoMicStop").hidden = false;
    } catch (e) { setMicState("error", e.name === "NotAllowedError" ? "رفض إذن الميكروفون" : e.message); }
  });

  // VU meter
  setInterval(() => {
    const lv = state.adapter?.level?.() || 0;
    $("#vu").style.width = `${Math.min(100, lv * 240)}%`;
  }, 120);

  // mode toggle (prepared tracking vs improvised)
  document.querySelectorAll("#micMode button").forEach(b => {
    b.addEventListener("click", () => {
      state.mode = b.dataset.mode;
      document.querySelectorAll("#micMode button").forEach(x => x.classList.toggle("on", x === b));
    });
  });

  // ---- product flow: phone viewer (via QR) or TV onboarding -----------------
  if (params.get("view") === "mobile") {
    document.querySelector("#onboard")?.remove();
    const mIdx = parseInt(params.get("m") || "0", 10) || 0;
    enterMobileMode(mIdx);
    // synced mode: follow the mosque screen's session through the relay
    let synced = false, fallbackStarted = false;
    const startFallback = () => {
      if (fallbackStarted || synced) return;
      fallbackStarted = true;
      $("#mobileTicker").textContent = "بث تجريبي مستقل";
      mobileFollowLoop(t => perform(t), () => player.busy, (i, n) => {
        $("#mobileTicker").textContent = `بث تجريبي مستقل · ${i + 1}/${n}`;
      }, () => synced);
    };
    try {
      const es = new EventSource(`/api/live/stream?m=${mIdx}`);
      es.onmessage = ev => {
        try {
          const e = JSON.parse(ev.data);
          if (e.type === "perform") {
            synced = true;
            $("#mobileTicker").textContent = "متزامن مع شاشة المسجد";
            performItems(e.text, e.items || [], { flag: !!e.flag });
          }
        } catch {}
      };
      es.onerror = () => { es.close(); startFallback(); };
      setTimeout(startFallback, 5000);   // no screen session -> labeled demo loop
      $("#mobileTicker").textContent = "بانتظار بث الشاشة…";
    } catch { startFallback(); }
  } else {
    const setup = await onboardingPromise;
    state.mosqueIdx = setup.mosqueIdx;
    if (setup.khutbah) {
      sentences.length = 0;
      setup.khutbah.sentences.forEach(t => sentences.push({ text: t, display: t }));
      rebuildList();
      document.querySelector("#paneSent .pane-hint").textContent =
        `خطبة «${setup.khutbah.title}» المرفوعة — اضغط جملة ليترجمها المترجم الرقمي.`;
    }
    await markLive(setup);
    $("#qrToggle").hidden = false;
    $("#qrToggle").addEventListener("click", () => { $("#qrCard").hidden = !$("#qrCard").hidden; });
    $("#qrCard").addEventListener("click", () => { $("#qrCard").hidden = true; });
    const btnSetup = $("#btnSetup");
    btnSetup.hidden = false;
    btnSetup.addEventListener("click", () => location.reload());
  }
  $("#panelHandle")?.addEventListener("click", () => document.body.classList.toggle("panel-closed"));
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
