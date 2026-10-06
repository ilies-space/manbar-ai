#!/usr/bin/env node
// Generates the voiced demo khutbah for the «الاستماع المباشر» button (assets/audio/khutbah_NN.mp3).
// Uses OpenAI text-to-speech with the team key from .env (never committed, never sent anywhere else).
//
//   node tools/make_demo_audio.cjs            # all 11 sentences
//   node tools/make_demo_audio.cjs 5 8        # only sentences 5 and 8
//
// The text is FULLY VOCALISED so every word is pronounced correctly; the verses use the vocalised
// mushaf text (Al-Hujurat 13, An-Nahl 90 as quoted). Listen to every file before using it.
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error("ضع OPENAI_API_KEY في ملف .env أولاً"); process.exit(1); }

const MODEL = process.env.TTS_MODEL || "gpt-4o-mini-tts";
const VOICE = process.env.TTS_VOICE || "onyx";
const STYLE = `أنت خطيب جمعة في مسجد، تلقي الخطبة بالعربية الفصحى بصوت رجل هادئ وقور واضح، بنبرة بشرية طبيعية دافئة غير آلية.
انطق كل كلمة بحركاتها كما هي مكتوبة تماماً، مع إظهار مخارج الحروف العربية (ع، ح، ق، ض، ظ) بوضوح.
السرعة متوسطة إلى بطيئة، مع وقفة قصيرة عند الفواصل ووقفة أطول عند نهاية الجملة.
عند قراءة الآية القرآنية (بين القوسين ﴿ ﴾) اقرأها بخشوع وترتيل خفيف وتمهّل، دون أي تغيير في ألفاظها.`;

const LINES = [
  "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ، وَالصَّلَاةُ وَالسَّلَامُ عَلَى أَشْرَفِ الْأَنْبِيَاءِ وَالْمُرْسَلِينَ، أَمَّا بَعْدُ:",
  "فَأُوصِيكُمْ عِبَادَ اللَّهِ وَنَفْسِي بِتَقْوَى اللَّهِ عَزَّ وَجَلَّ، فَهِيَ وَصِيَّةُ اللَّهِ لِلْأَوَّلِينَ وَالْآخِرِينَ.",
  "أَيُّهَا الْمُؤْمِنُونَ، النَّاسُ عِنْدَ اللَّهِ سَوَاءٌ فِي أَصْلِهِمْ وَخِلْقَتِهِمْ.",
  "فَلَا فَضْلَ لِعَرَبِيٍّ عَلَى أَعْجَمِيٍّ، وَلَا لِأَبْيَضَ عَلَى أَسْوَدَ، إِلَّا بِالتَّقْوَى وَالْعَمَلِ الصَّالِحِ.",
  "يَقُولُ اللَّهُ سُبْحَانَهُ وَتَعَالَى فِي مُحْكَمِ كِتَابِهِ: ﴿يَا أَيُّهَا النَّاسُ إِنَّا خَلَقْنَاكُمْ مِنْ ذَكَرٍ وَأُنْثَىٰ وَجَعَلْنَاكُمْ شُعُوبًا وَقَبَائِلَ لِتَعَارَفُوا، إِنَّ أَكْرَمَكُمْ عِنْدَ اللَّهِ أَتْقَاكُمْ، إِنَّ اللَّهَ عَلِيمٌ خَبِيرٌ﴾.",
  "أَفْضَلُ النَّاسِ عِنْدَ اللَّهِ هُوَ أَكْثَرُهُمْ تَقْوَى.",
  "وَمِنْ ثَمَرَاتِ التَّقْوَى الْإِحْسَانُ إِلَى الْخَلْقِ، وَالرِّفْقُ بِهِمْ فِي الْقَوْلِ وَالْعَمَلِ.",
  "وَاللَّهُ سُبْحَانَهُ يَقُولُ: ﴿إِنَّ اللَّهَ يَأْمُرُ بِالْعَدْلِ وَالْإِحْسَانِ وَإِيتَاءِ ذِي الْقُرْبَىٰ﴾.",
  "فَاتَّقُوا اللَّهَ مَا اسْتَطَعْتُمْ، وَتَوَكَّلُوا عَلَيْهِ فِي أُمُورِكُمْ كُلِّهَا.",
  "وَاعْلَمُوا أَنَّ خَيْرَ الزَّادِ التَّقْوَى، وَخَيْرَ الْعَمَلِ أَدْوَمُهُ وَإِنْ قَلَّ.",
  "اللَّهُمَّ اجْعَلْنَا مِنَ الْمُتَّقِينَ الْمُحْسِنِينَ، وَاغْفِرْ لَنَا وَلِوَالِدِينَا وَلِجَمِيعِ الْمُسْلِمِينَ."
];

(async () => {
  const only = process.argv.slice(2).map(Number).filter(Boolean);
  const out = path.join(ROOT, "assets", "audio");
  fs.mkdirSync(out, { recursive: true });
  for (let i = 0; i < LINES.length; i++) {
    if (only.length && !only.includes(i + 1)) continue;
    const file = path.join(out, `khutbah_${String(i + 1).padStart(2, "0")}.mp3`);
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, voice: VOICE, input: LINES[i], instructions: STYLE, response_format: "mp3" })
    });
    if (!r.ok) { console.error(`✗ ${i + 1}: ${r.status} ${(await r.text()).slice(0, 200)}`); continue; }
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    console.log(`✓ ${path.basename(file)}`);
  }
  console.log("استمع لكل ملف وتأكد من النطق — خاصة الآيات — قبل التسليم.");
})();
