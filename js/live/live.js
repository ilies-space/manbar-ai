// المترجم الحي — app glue: stage + player + translate + mic

import { createStage } from "./scene.js";
import { buildRig } from "./rig.js";
import { SignPlayer } from "./player.js";
import { Translator, normalizeAr } from "./translate.js";
import { pickAdapter } from "./asr.js";

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);

const state = {
  mode: "prepared",          // prepared | improvised (mic path)
  pointer: -1,               // prepared-khutbah tracking pointer
  adapter: null,
  micOn: false
};

async function boot() {
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
  $("#chipEngine").textContent = translator.serverKey ? "ترجمة: OpenAI + قاموس" : "ترجمة: قاموس محلي";
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
    player.testPose(pose);
    $("#caption").textContent = params.get("wp");
    return;
  }

  // debug freeze: live.html?sign=GLOSS_DUA&t=0.7
  if (params.get("sign")) {
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

  async function perform(text, { flag = false } = {}) {
    const items = await translator.translate(text);
    player.clear();
    showPlan(items, { flag });
    // one chip per queue item for highlight simplicity: letters share the word chip
    const expanded = [];
    for (const it of items) expanded.push(it);
    player.enqueue(expanded);
    // re-map chips to queue items (letters of a word map to same chip)
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
    $("#srcBadge").textContent =
      translator.lastSource === "api" ? "ترجمة نموذج لغوي" :
      translator.lastSource === "cache" ? "من الذاكرة" : "قاموس محلي";
  }

  // ---- prepared sentences list -------------------------------------------
  const sentences = (typeof KHUTBAH !== "undefined" ? KHUTBAH.segments : [])
    .map(s => ({ id: s.id, text: s.type === "verse" ? s.original : (s.original || "") , plain: s.type === "verse" ? s.original : s.original }));
  const list = $("#sentenceList");
  sentences.forEach((s, i) => {
    const li = document.createElement("button");
    li.className = "sent";
    li.textContent = s.text;
    li.addEventListener("click", () => { selectSentence(i); perform(s.text); });
    list.appendChild(li);
  });
  function selectSentence(i) {
    state.pointer = i;
    [...list.children].forEach((el, j) => el.classList.toggle("on", j === i));
    list.children[i]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // ---- free text -----------------------------------------------------------
  $("#btnSay").addEventListener("click", () => {
    const t = $("#freeText").value.trim();
    if (t) perform(t, { flag: true });
  });

  // ---- tabs -----------------------------------------------------------------
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t === tab));
      document.querySelectorAll(".pane").forEach(p => p.hidden = p.id !== tab.dataset.pane);
    });
  });

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
  }

  function matchPrepared(text) {
    // normalized shared-word ratio against sentences from pointer forward
    const words = new Set(normalizeAr(text).split(" ").filter(w => w.length > 2));
    if (!words.size) return -1;
    let best = -1, bestScore = 0.49;
    for (let i = Math.max(0, state.pointer); i < Math.min(sentences.length, state.pointer + 4 || 4); i++) {
      const sw = normalizeAr(sentences[i].text).split(" ").filter(w => w.length > 2);
      if (!sw.length) continue;
      const hit = sw.filter(w => words.has(w)).length / sw.length;
      if (hit > bestScore) { bestScore = hit; best = i; }
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
      micBtn.textContent = "ابدأ الاستماع";
      micBtn.classList.remove("live");
      return;
    }
    state.adapter = await pickAdapter({
      onText: (t, { final }) => { $("#interim").textContent = t; if (final) { $("#interim").textContent = ""; onFinalText(t); } },
      onState: setMicState
    });
    if (!state.adapter) { setMicState("error", "لا يوجد مدخل صوت مدعوم"); return; }
    $("#chipAsr").textContent = state.adapter.name;
    try {
      await state.adapter.start();
      state.micOn = true;
      micBtn.textContent = "أوقف الاستماع";
      micBtn.classList.add("live");
    } catch (e) { setMicState("error", "رفض إذن الميكروفون"); }
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
}

boot().catch(e => {
  console.error(e);
  const el = document.querySelector("#bootError");
  if (el) { el.hidden = false; el.textContent = "تعذر تحميل المشهد: " + e.message; }
});
