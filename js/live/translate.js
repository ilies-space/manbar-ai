// text -> gloss sequence. Order: cache -> OpenAI (n8n webhook or local proxy)
// -> rule-based dictionary (always works offline).

import { apiResolve, apiRequest, apiCurrent } from "./api.js";

const STOP = new Set(["في","من","على","ان","أن","إن","و","يا","ما","لا","الى","إلى","عن","قد","ثم","او","أو","هو","هي","كل","لكم","لكم،","بعد","أما","اما","التي","الذي","ايها","أيها"]);

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

export function normalizeAr(s) {
  return s
    .replace(/[ً-ْٰـ]/g, "")   // harakat + tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[،.؛:!؟"'()\[\]«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function ruleTranslate(text) {
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

export function needsNegationReview(text) {
  return normalizeAr(text).split(" ").some(word => /^(?:و|ف)?(?:لا|ليس|ليست|لست|لم|لن)$/.test(word));
}

export class Translator {
  constructor() {
    this.cache = {};         // normalized text -> items
    this.serverKey = false;  // proxy reachable AND has an API key
    this.lastSource = "rules";
  }

  async init() {
    // Session cache stays in memory; saved transcripts are not public assets.
    this.api = await apiResolve();
    this.serverKey = this.api.key && !!this.api.gloss;
  }

  async translate(text) {
    this.warning = "";
    const key = normalizeAr(text);
    if (needsNegationReview(text)) {
      this.lastSource = "review";
      this.warning = "تحتاج هذه الجملة إلى مراجعة؛ القاموس الحالي لا يمثّل النفي بأمان.";
      return [];
    }
    if (this.cache[key]) { this.lastSource = "cache"; return this.cache[key]; }

    if (this.serverKey) {
      try {
        const d = await apiRequest("gloss", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text })
        });
        {
          this.api = apiCurrent();
          const items = (d.glosses || []).map(g =>
            typeof g === "string" ? { kind: "gloss", id: g } : { kind: "spell", word: g.spell }
          ).filter(it => it.kind === "spell" || it.id);
          if (items.length) {
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
