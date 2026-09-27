// Demo data: sample khutbah with timings, sign glossary, review states, pilot metrics.
// In the real product this comes from the imam portal + ASR pipeline + review workflow.

const KHUTBAH = {
  title: "التقوى أساس الكرامة",
  mosque: "مسجد النور",
  date: "الجمعة 9 أكتوبر 2026م",
  uploadedAt: "الخميس 8 أكتوبر · 8:14 مساءً",
  // Simplified sentences use {{glossaryKey|displayText}} to mark
  // terms that have a verified sign-language clip.
  segments: [
    {
      id: 1, t: 0, d: 8, type: "sentence",
      original: "الحمد لله رب العالمين، والصلاة والسلام على أشرف الأنبياء والمرسلين، أما بعد",
      simple: "نبدأ بحمد الله، والصلاة على النبي محمد ﷺ",
      terms: [], review: "approved"
    },
    {
      id: 2, t: 8, d: 9, type: "sentence",
      original: "فأوصيكم عباد الله ونفسي بتقوى الله عز وجل، فهي وصية الله للأولين والآخرين",
      simple: "أوصيكم ونفسي {{التقوى|بتقوى الله}}، فهي وصية الله لكل الناس",
      terms: ["التقوى"], review: "approved"
    },
    {
      id: 3, t: 17, d: 7, type: "sentence",
      original: "أيها المؤمنون، الناس عند الله سواء في أصلهم وخلقتهم",
      simple: "الناس عند الله سواء في أصلهم",
      terms: [], review: "approved"
    },
    {
      id: 4, t: 24, d: 8, type: "sentence",
      original: "فلا فضل لعربي على أعجمي ولا لأبيض على أسود إلا بالتقوى والعمل الصالح",
      simple: "لا أحد أفضل من أحد إلا {{التقوى|بالتقوى}} والعمل الصالح",
      terms: ["التقوى"], review: "approved"
    },
    {
      id: 5, t: 32, d: 15, type: "verse",
      original: "يقول الله سبحانه وتعالى في محكم كتابه",
      simple: "",
      verse: {
        text: "﴿ يَا أَيُّهَا النَّاسُ إِنَّا خَلَقْنَاكُم مِّن ذَكَرٍ وَأُنثَىٰ وَجَعَلْنَاكُمْ شُعُوبًا وَقَبَائِلَ لِتَعَارَفُوا ۚ إِنَّ أَكْرَمَكُمْ عِندَ اللَّهِ أَتْقَاكُمْ ۚ إِنَّ اللَّهَ عَلِيمٌ خَبِيرٌ ﴾",
        source: "سورة الحجرات · الآية 13",
        tafsir: "يا أيها الناس إنا خلقناكم من أبٍ واحد وأمٍّ واحدة، وجعلناكم شعوبًا وقبائل لتتعارفوا، وإن أكرمكم عند الله أشدُّكم اتقاءً له."
      },
      terms: ["التقوى"], review: "verse"
    },
    {
      id: 6, t: 47, d: 7, type: "sentence",
      original: "أفضل الناس عند الله هو أكثرهم تقوى",
      simple: "أفضل الناس عند الله هو أكثرهم {{التقوى|تقوى}}",
      terms: ["التقوى"], review: "approved"
    },
    {
      id: 7, t: 54, d: 8, type: "sentence",
      original: "ومن ثمرات التقوى الإحسان إلى الخلق والرفق بهم في القول والعمل",
      simple: "من ثمرات التقوى {{الإحسان|الإحسان}} إلى الناس والرفق بهم",
      terms: ["الإحسان"], review: "edited"
    },
    {
      id: 8, t: 62, d: 13, type: "verse",
      original: "والله سبحانه يقول",
      simple: "",
      verse: {
        text: "﴿ إِنَّ اللَّهَ يَأْمُرُ بِالْعَدْلِ وَالْإِحْسَانِ وَإِيتَاءِ ذِي الْقُرْبَىٰ ﴾",
        source: "سورة النحل · الآية 90",
        tafsir: "إن الله يأمر عباده بالعدل والإحسان، وإعطاء ذوي القربى ما تحصل به صلتهم."
      },
      terms: ["الإحسان"], review: "verse"
    },
    {
      id: 9, t: 75, d: 8, type: "sentence",
      original: "فاتقوا الله ما استطعتم، وتوكلوا عليه في أموركم كلها",
      simple: "اتقوا الله قدر استطاعتكم، {{التوكل|وتوكلوا}} عليه في كل أموركم",
      terms: ["التوكل"], review: "approved"
    },
    {
      id: 10, t: 83, d: 8, type: "sentence",
      original: "واعلموا أن خير الزاد التقوى، وخير العمل أدومه وإن قل",
      simple: "خير الزاد التقوى، وأفضل العمل ما داوم عليه صاحبه ولو كان قليلاً",
      terms: [], review: "approved"
    },
    {
      id: 11, t: 91, d: 9, type: "dua",
      original: "اللهم اجعلنا من المتقين المحسنين، واغفر لنا ولوالدينا ولجميع المسلمين",
      simple: "اللهم اجعلنا من المتقين المحسنين، واغفر لنا ولوالدينا ولجميع المسلمين",
      terms: [], review: "approved"
    }
  ]
};

KHUTBAH.duration = (() => {
  const last = KHUTBAH.segments[KHUTBAH.segments.length - 1];
  return last.t + last.d;
})();

const GLOSSARY = {
  "التقوى": {
    def: "امتثال أوامر الله واجتناب نواهيه؛ أن تجعل بينك وبين ما يُغضب الله وقاية.",
    signer: "أ. سارة الحربي — مترجمة معتمدة",
    status: "موثق"
  },
  "الإحسان": {
    def: "أن تعبد الله كأنك تراه، وإتقان العمل ومعاملة الناس بالخير.",
    signer: "أ. سارة الحربي — مترجمة معتمدة",
    status: "موثق"
  },
  "التوكل": {
    def: "الاعتماد على الله في جلب المنافع ودفع المضار، مع الأخذ بالأسباب.",
    signer: "أ. خالد العمري — مترجم معتمد",
    status: "موثق"
  },
  "العمل الصالح": {
    def: "كل قولٍ أو فعلٍ يحبه الله ويرضاه.",
    signer: "لم يُسجَّل بعد",
    status: "قيد التوثيق"
  }
};

/* Pilot / simulation metrics — demo figures, clearly labeled in the UI */
const METRICS = {
  comprehension: { without: 31, with: 78, note: "نسبة الإجابات الصحيحة عن أسئلة فهم الخطبة · عينة محاكاة: 12 مشاركاً أصم" },
  sync: 94,
  fidelity: 95
};

const NEXT_KHUTBAH = {
  title: "الرحمة بالضعفاء",
  reviewed: 5,
  total: 12
};
