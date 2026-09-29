// Demo data: sample khutbah with timings, sign vocabulary, review states, pilot metrics.
// In the real product this comes from the imam portal + ASR pipeline + review workflow.
// `sign` points at the interpreter clip the digital signer plays for that segment
// (demo uses 3 stand-in clips; production generates the full khutbah video).

const KHUTBAH = {
  title: "التقوى أساس الكرامة",
  mosque: "مسجد النور",
  date: "الجمعة 9 أكتوبر 2026م",
  uploadedAt: "الخميس 8 أكتوبر · 8:14 مساءً",
  segments: [
    {
      id: 1, t: 0, d: 8, type: "sentence",
      original: "الحمد لله رب العالمين، والصلاة والسلام على أشرف الأنبياء والمرسلين، أما بعد",
      simple: "نبدأ بحمد الله، والصلاة على النبي محمد ﷺ",
      en: "We begin by praising Allah, and sending blessings upon the Prophet Muhammad ﷺ.",
      sign: "assets/video/sign-taqwa.webm",
      terms: [], review: "approved"
    },
    {
      id: 2, t: 8, d: 9, type: "sentence",
      original: "فأوصيكم عباد الله ونفسي بتقوى الله عز وجل، فهي وصية الله للأولين والآخرين",
      simple: "أوصيكم ونفسي {{التقوى|بتقوى الله}}، فهي وصية الله لكل الناس",
      en: "I advise you and myself to be mindful of Allah (taqwa) — His advice to all people.",
      sign: "assets/video/sign-ihsan.webm",
      terms: ["التقوى"], review: "approved"
    },
    {
      id: 3, t: 17, d: 7, type: "sentence",
      original: "أيها المؤمنون، الناس عند الله سواء في أصلهم وخلقتهم",
      simple: "الناس عند الله سواء في أصلهم",
      en: "Believers: in their origin, all people are equal before Allah.",
      sign: "assets/video/sign-tawakkul.webm",
      terms: [], review: "approved"
    },
    {
      id: 4, t: 24, d: 8, type: "sentence",
      original: "فلا فضل لعربي على أعجمي ولا لأبيض على أسود إلا بالتقوى والعمل الصالح",
      simple: "لا أحد أفضل من أحد إلا {{التقوى|بالتقوى}} والعمل الصالح",
      en: "No one is better than anyone else except through taqwa and good deeds.",
      sign: "assets/video/sign-taqwa.webm",
      terms: ["التقوى"], review: "approved"
    },
    {
      id: 5, t: 32, d: 15, type: "verse",
      original: "يقول الله سبحانه وتعالى في محكم كتابه",
      simple: "",
      en: "Allah, Glorified and Exalted, says in His Book:",
      sign: "assets/video/sign-ihsan.webm",
      verse: {
        text: "﴿ يَا أَيُّهَا النَّاسُ إِنَّا خَلَقْنَاكُم مِّن ذَكَرٍ وَأُنثَىٰ وَجَعَلْنَاكُمْ شُعُوبًا وَقَبَائِلَ لِتَعَارَفُوا ۚ إِنَّ أَكْرَمَكُمْ عِندَ اللَّهِ أَتْقَاكُمْ ۚ إِنَّ اللَّهَ عَلِيمٌ خَبِيرٌ ﴾",
        source: "سورة الحجرات · الآية 13",
        tafsir: "يا أيها الناس إنا خلقناكم من أبٍ واحد وأمٍّ واحدة، وجعلناكم شعوبًا وقبائل لتتعارفوا، وإن أكرمكم عند الله أشدُّكم اتقاءً له.",
        en: "O mankind, We created you from male and female and made you peoples and tribes that you may know one another. Indeed, the most noble of you in the sight of Allah is the most righteous of you. (Al-Hujurat 49:13 — approved translation)"
      },
      terms: ["التقوى"], review: "verse"
    },
    {
      id: 6, t: 47, d: 7, type: "sentence",
      original: "أفضل الناس عند الله هو أكثرهم تقوى",
      simple: "أفضل الناس عند الله هو أكثرهم {{التقوى|تقوى}}",
      en: "The best of people before Allah are those with the most taqwa.",
      sign: "assets/video/sign-tawakkul.webm",
      terms: ["التقوى"], review: "approved"
    },
    {
      id: 7, t: 54, d: 8, type: "sentence",
      original: "ومن ثمرات التقوى الإحسان إلى الخلق والرفق بهم في القول والعمل",
      simple: "من ثمرات التقوى {{الإحسان|الإحسان}} إلى الناس والرفق بهم",
      en: "One fruit of taqwa is ihsan: excellence and gentleness toward people.",
      sign: "assets/video/sign-ihsan.webm",
      terms: ["الإحسان"], review: "edited"
    },
    {
      id: 8, t: 62, d: 13, type: "verse",
      original: "والله سبحانه يقول",
      simple: "",
      en: "And Allah, Glorified is He, says:",
      sign: "assets/video/sign-taqwa.webm",
      verse: {
        text: "﴿ إِنَّ اللَّهَ يَأْمُرُ بِالْعَدْلِ وَالْإِحْسَانِ وَإِيتَاءِ ذِي الْقُرْبَىٰ ﴾",
        source: "سورة النحل · الآية 90",
        tafsir: "إن الله يأمر عباده بالعدل والإحسان، وإعطاء ذوي القربى ما تحصل به صلتهم.",
        en: "Indeed, Allah commands justice, excellence, and giving to relatives. (An-Nahl 16:90 — approved translation)"
      },
      terms: ["الإحسان"], review: "verse"
    },
    {
      id: 9, t: 75, d: 8, type: "sentence",
      original: "فاتقوا الله ما استطعتم، وتوكلوا عليه في أموركم كلها",
      simple: "اتقوا الله قدر استطاعتكم، {{التوكل|وتوكلوا}} عليه في كل أموركم",
      en: "Be mindful of Allah as much as you can, and put your trust in Him in all your affairs.",
      sign: "assets/video/sign-tawakkul.webm",
      terms: ["التوكل"], review: "approved"
    },
    {
      id: 10, t: 83, d: 8, type: "sentence",
      original: "واعلموا أن خير الزاد التقوى، وخير العمل أدومه وإن قل",
      simple: "خير الزاد التقوى، وأفضل العمل ما داوم عليه صاحبه ولو كان قليلاً",
      en: "The best provision is taqwa, and the best deeds are the consistent ones, even if small.",
      sign: "assets/video/sign-taqwa.webm",
      terms: [], review: "approved"
    },
    {
      id: 11, t: 91, d: 9, type: "dua",
      original: "اللهم اجعلنا من المتقين المحسنين، واغفر لنا ولوالدينا ولجميع المسلمين",
      simple: "اللهم اجعلنا من المتقين المحسنين، واغفر لنا ولوالدينا ولجميع المسلمين",
      en: "O Allah, make us among the righteous and the excellent, and forgive us, our parents, and all Muslims.",
      sign: "assets/video/sign-ihsan.webm",
      terms: [], review: "approved"
    }
  ]
};

KHUTBAH.duration = (() => {
  const last = KHUTBAH.segments[KHUTBAH.segments.length - 1];
  return last.t + last.d;
})();

// Mock nearby mosques for the "join a live khutbah" entry screen
const MOSQUES = [
  { name: "مسجد النور", city: "الرياض", live: true, khutbah: "التقوى أساس الكرامة" },
  { name: "جامع الرحمة", city: "الرياض", live: false },
  { name: "مسجد الفرقان", city: "جدة", live: false }
];

// Sign vocabulary. Every sign the digital interpreter performs is motion-
// transferred from a certified interpreter's recording — never invented by AI.
// Demo clips are stand-ins from an open sign-language dictionary (CC BY-SA).
const GLOSSARY = {
  "التقوى": {
    def: "امتثال أوامر الله واجتناب نواهيه؛ أن تجعل بينك وبين ما يُغضب الله وقاية.",
    signer: "الهدف: تسجيل مترجم معتمد بلغة الإشارة العربية، يُنقل حركةً إلى المترجم الرقمي",
    video: "assets/video/sign-taqwa.webm",
    demo: "مقطع مؤقت للعرض: Uprising Man · لغة إشارة غانية · CC0 · ويكيميديا كومنز",
    status: "مقطع تجريبي"
  },
  "الإحسان": {
    def: "أن تعبد الله كأنك تراه، وإتقان العمل ومعاملة الناس بالخير.",
    signer: "الهدف: تسجيل مترجم معتمد بلغة الإشارة العربية، يُنقل حركةً إلى المترجم الرقمي",
    video: "assets/video/sign-ihsan.webm",
    demo: "مقطع مؤقت للعرض: Uprising Man · لغة إشارة غانية · CC0 · ويكيميديا كومنز",
    status: "مقطع تجريبي"
  },
  "التوكل": {
    def: "الاعتماد على الله في جلب المنافع ودفع المضار، مع الأخذ بالأسباب.",
    signer: "الهدف: تسجيل مترجم معتمد بلغة الإشارة العربية، يُنقل حركةً إلى المترجم الرقمي",
    video: "assets/video/sign-tawakkul.webm",
    demo: "مقطع مؤقت للعرض: Uprising Man · لغة إشارة غانية · CC0 · ويكيميديا كومنز",
    status: "مقطع تجريبي"
  },
  "العمل الصالح": {
    def: "كل قولٍ أو فعلٍ يحبه الله ويرضاه.",
    signer: "لم يُسجَّل بعد — تُهجّى الكلمة بالأصابع وتظهر نصاً حتى تُعتمد إشارتها",
    status: "قيد التوثيق"
  }
};

/* Pilot / simulation metrics — demo figures, clearly labeled in the UI */
const METRICS = {
  comprehension: { without: 31, with: 78, note: "نسبة الإجابات الصحيحة عن أسئلة فهم الخطبة · عينة محاكاة: 12 مشاركاً أصم" },
  sync: 94,
  signAccuracy: 92
};

const NEXT_KHUTBAH = {
  title: "الرحمة بالضعفاء",
  reviewed: 5,
  total: 12
};
