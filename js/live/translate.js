// text -> gloss sequence. Order: cache -> OpenAI (n8n webhook or local proxy)
// -> rule-based dictionary (always works offline).

import { apiResolve, apiRequest, apiCurrent } from "./api.js";

const STOP = new Set(["علي","الي","عند","فلا","فان","فإن","وان","وإن","الا","إلا","كما","هذا","هذه","ذلك","تلك","الذين","اللذين","انه","إنه","انها","إنها","لقد","ولقد","حتى","اذا","إذا","بل","لعل","لعلكم","قال","يقول","وقال","وقولوا","قولوا","منه","منها","فيه","فيها","به","بها","له","لها","عليه","عليها","اليه","إليه","ولا","وما","فما","ثم","اي","أي","في","من","على","ان","أن","إن","و","يا","ما","لا","الى","إلى","عن","قد","ثم","او","أو","هو","هي","كل","لكم","لكم،","بعد","أما","اما","التي","الذي","ايها","أيها"]);

const DICT = [
  [["الله","لله","بالله","والله","رب","ربكم","ربنا"], "GLOSS_ALLAH"],
  [["حمد","الحمد","نحمد","بحمد"], "GLOSS_ALHAMD"],
  [["صلاة","الصلاة","صلوا","والصلاة","نصلي","يصلي"], "GLOSS_SALAH"],
  [["سلام","السلام","والسلام"], "GLOSS_SALAM"],
  [["ناس","الناس","للناس"], "GLOSS_NAS"],
  [["تقوى","التقوى","بتقوى","اتقوا","فاتقوا","المتقين","تقوا","أتقاكم","اتقاكم"], "GLOSS_TAQWA"],
  [["احسان","الإحسان","الاحسان","محسنين","المحسنين","أحسنوا"], "GLOSS_IHSAN"],
  [["جمعة","الجمعة"], "GLOSS_JUMUAH"],
  [["قران","القران","القرآن","كتابه","المصحف","آية","آيات"], "GLOSS_QURAN"],
  [["نبي","النبي","رسول","الرسول","محمد","المرسلين","الانبياء","الأنبياء"], "GLOSS_NABI"],
  [["خير","الخير","خيركم"], "GLOSS_KHAYR"],
  [["عمل","العمل","عملا","اعمال","الأعمال","يعمل","اعملوا"], "GLOSS_AMAL"],
  [["سواء","سواسية"], "GLOSS_SAWA"],
  [["دعاء","الدعاء","اللهم","ادعوا","يدعو"], "GLOSS_DUA"],
  [["اسلام","الإسلام","الاسلام","مسلم","مسلمين","المسلمين"], "GLOSS_ISLAM"],
  [["يوم","اليوم","يومكم"], "GLOSS_YAWM"],
  [["قلب","القلب","قلوب","قلوبكم"], "GLOSS_QALB"],
  [["رحمة","الرحمة","رحيم","الرحيم","رحمن","الرحمن","ارحم"], "GLOSS_RAHMA"]
];

// ---- KArSL khutbah dictionary (501 recorded signs, ~1,500 forms) ----------------
// normalized phrase -> sign id; longest phrase wins; clitics (و، ف، ب، ال…) and
// pronoun suffixes are stripped when the bare form is in the dictionary.
let KMAP = null, KMAX = 1;
export async function loadKarslDictionary() {
  try {
    const d = await fetch("assets/lexicon/aliases_karsl.json").then(r => r.json());
    KMAP = new Map(Object.entries(d.map));
    for (const k of KMAP.keys()) KMAX = Math.max(KMAX, k.split(" ").length);
  } catch { KMAP = null; }
}
const KTASH = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g;
export function knorm(s) {
  return s.replace(KTASH, "").replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[^\u0621-\u064a0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
const PREFIXES = ["وبال", "فبال", "وال", "فال", "بال", "كال", "لل", "ال", "و", "ف", "ب", "ل", "ك"];
const SUFFIXES = ["هما", "كما", "تهم", "هم", "كم", "هن", "نا", "ها", "ون", "ين", "ات", "ان", "ه", "ي", "ك"];
function variants(t) {
  const out = new Set([t]);
  for (const p of PREFIXES) if (t.startsWith(p) && t.length - p.length >= (p.length === 1 ? 3 : 2)) out.add(t.slice(p.length));
  for (const v of [...out]) for (const x of SUFFIXES) if (v.endsWith(x) && v.length - x.length >= 2) out.add(v.slice(0, -x.length));
  return [...out];
}
/** text -> [{kind:"gloss", id, word}] using the KArSL dictionary; unmatched words are returned as gaps */
export function karslGloss(text) {
  if (!KMAP) return null;
  const t = knorm(text).split(" ").filter(Boolean);
  const out = [];
  for (let i = 0; i < t.length;) {
    let hit = null, used = 1;
    for (let n = Math.min(KMAX, t.length - i); n >= 1 && !hit; n--) {
      const ph = t.slice(i, i + n);
      const firsts = variants(ph[0]), lasts = n > 1 ? variants(ph[n - 1]) : [""];
      outer: for (const f of firsts) for (const l of lasts) {
        const k = n > 1 ? [f, ...ph.slice(1, n - 1), l].join(" ") : f;
        if (KMAP.has(k)) { hit = KMAP.get(k); used = n; break outer; }
      }
    }
    if (hit) { if (!out.length || out[out.length - 1].id !== hit) out.push({ kind: "gloss", id: hit, word: t.slice(i, i + used).join(" ") }); i += used; }
    else { out.push({ kind: "gap", word: t[i] }); i++; }
  }
  return out;
}

export function normalizeAr(s) {
  return s
    .replace(/[ً-ْٰـ]/g, "")   // harakat + tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[،.؛:!؟"'()\[\]«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function ruleTranslate(text) {
  const k = karslGloss(text);
  if (k) {
    const items = [];
    let spells = 0;
    for (const it of k) {
      if (it.kind === "gloss") { items.push({ kind: "gloss", id: it.id }); continue; }
      const w = normalizeAr(it.word);
      if (!w || STOP.has(w) || w.length < 2) continue;
      const legacy = legacyGloss(w);
      if (legacy) { if (!items.length || items[items.length - 1].id !== legacy) items.push({ kind: "gloss", id: legacy }); }
      else if (w.length >= 3 && spells < 2) { items.push({ kind: "spell", word: w }); spells++; }
    }
    return items;
  }
  return legacyTranslate(text);
}

function legacyGloss(w) {
  for (const [keys, gloss] of DICT) if (keys.some(k => w === normalizeAr(k) || w === "ال" + normalizeAr(k))) return gloss;
  return null;
}

function legacyTranslate(text) {
  const words = normalizeAr(text).split(" ");
  const items = [];
  let spells = 0;
  for (const w of words) {
    if (!w || STOP.has(w) || w.length < 2) continue;
    let hit = null;
    for (const [keys, gloss] of DICT) {
      if (keys.some(k => w === normalizeAr(k) || w === "ال" + normalizeAr(k))) { hit = gloss; break; }
    }
    if (!hit) {
      for (const [keys, gloss] of DICT) {
        if (keys.some(k => w.includes(normalizeAr(k)) && normalizeAr(k).length >= 3)) { hit = gloss; break; }
      }
    }
    if (hit) {
      if (items.length === 0 || items[items.length - 1].id !== hit) items.push({ kind: "gloss", id: hit });
    } else if (w.length >= 3 && spells < 2) {
      items.push({ kind: "spell", word: w });
      spells++;
    }
  }
  return items;
}

const NEG_RE = /^(?:و|ف)?(?:لا|ليس|ليست|لست|لسنا|لم|لن)$/;
// fixed formulas where «لا» is part of the creed, not a negated action (signed as one unit)
const NEG_FIXED = ["اشهد ان لا اله الا الله", "لا اله الا الله", "وحده لا شريك له", "لا شريك له"];
function stripFixed(t) { let x = " " + t + " "; for (const f of NEG_FIXED) x = x.split(" " + f + " ").join(" ¦ "); return x.trim(); }

export function needsNegationReview(text) {
  return stripFixed(normalizeAr(text).replace(/[إأآٱ]/g, "ا")).split(" ").some(word => NEG_RE.test(word));
}

/**
 * Negated speech -> signs with an explicit NEGATION sign (GLOSS_NEG) right after the sign of the word it negates,
 * e.g. «لا تؤذوا الناس» -> [أذى][لا][الناس]. A negated sentence is never reduced to its affirmative signs:
 * if the negated word cannot be signed or spelled, the sentence goes back to review (text only).
 */
export function negatedTranslate(text) {
  const norm = normalizeAr(text).replace(/[إأآٱ]/g, "ا");
  const fixedOut = stripFixed(norm);
  const parts = fixedOut.split(" ").filter(Boolean);
  const items = [];
  const push = arr => { for (const it of arr) if (!(it.kind === "gloss" && items.length && items[items.length - 1].id === it.id)) items.push(it); };
  let buf = [], negs = 0, ok = true;
  const flush = () => { if (buf.length) push(ruleTranslate(buf.join(" "))); buf = []; };
  for (let i = 0; i < parts.length; i++) {
    const w = parts[i];
    if (w === "¦") { flush(); push(ruleTranslate("لا اله الا الله")); continue; }
    if (!NEG_RE.test(w)) { buf.push(w); continue; }
    flush();
    negs++;
    // the negated predicate: the shortest run of following words that yields a sign (or a spelled word)
    let scope = null, j = i + 1;
    for (; j < parts.length && j <= i + 3; j++) {
      if (parts[j] === "¦" || NEG_RE.test(parts[j])) break;
      const tr = ruleTranslate(parts.slice(i + 1, j + 1).join(" "));
      if (tr.length) { scope = tr; break; }
    }
    if (!scope) { ok = false; break; }
    push(scope);
    items.push({ kind: "gloss", id: "GLOSS_NEG" });
    i = j;
  }
  flush();
  if (!(ok && negs && items.length)) return [];
  // keep finger-spelling short: the negated words are always kept, other spelled words only while ≤ 3 in total
  let spells = items.filter((it, k) => it.kind === "spell" && items[k + 1]?.id === "GLOSS_NEG").length;
  return items.filter((it, k) => it.kind !== "spell" || items[k + 1]?.id === "GLOSS_NEG" || ++spells <= 3);
}

export class Translator {
  constructor() {
    this.cache = {};         // normalized text -> items
    this.serverKey = false;  // proxy reachable AND has an API key
    this.lastSource = "rules";
  }

  async init() {
    // Session cache stays in memory; saved transcripts are not public assets.
    await loadKarslDictionary();
    this.api = await apiResolve();
    this.serverKey = this.api.key && !!this.api.gloss;
  }

  async translate(text) {
    this.warning = "";
    const key = normalizeAr(text);
    if (this.cache[key]) { this.lastSource = this.cache[key].some(it => it.id === "GLOSS_NEG") ? "negation" : "cache"; return this.cache[key]; }
    if (needsNegationReview(text)) {
      // negation is signed explicitly (word + «لا»); the AI path is skipped so the negation can never be dropped
      const items = negatedTranslate(text);
      if (!items.length) {
        this.lastSource = "review";
        this.warning = "تحتاج هذه الجملة إلى مراجعة؛ تعذّر تمثيل النفي بأمان — يُعرض النص فقط.";
        return [];
      }
      this.lastSource = "negation";
      this.warning = "النفي بإشارة «لا» بعد الكلمة المنفيّة — بانتظار اعتماد مترجم";
      this.cache[key] = items;
      return items;
    }

    if (this.serverKey) {
      try {
        const d = await apiRequest("gloss", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, vocab: KMAP ? [...new Set(KMAP.values())] : undefined })
        });
        {
          this.api = apiCurrent();
          const items = (d.glosses || []).map(g =>
            typeof g === "string" ? { kind: "gloss", id: g } : { kind: "spell", word: g.spell }
          ).filter(it => it.kind === "spell" || it.id);
          // the AI layer is used once it answers with the KArSL vocabulary (n8n prompt updated to
          // read `vocab`); until then the 501-sign dictionary is richer than the 18 placeholder signs
          const rules = ruleTranslate(text);
          const karslAware = items.some(it => String(it.id || "").startsWith("KARSL_"));
          if (items.length && (karslAware || !rules.some(it => it.kind === "gloss"))) {
            this.cache[key] = items;
            this.lastSource = "api";
            return items;
          }
        }
      } catch {}
    }
    this.lastSource = "rules";
    const items = ruleTranslate(text);
    this.cache[key] = items;
    return items;
  }
}
