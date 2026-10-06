// Pre-prepared machine translations of the demo khutbah sentences (shown labelled «ترجمة آلية مُعدّة مسبقاً»).
// English comes from js/data.js (KHUTBAH.segments[].en). Quran verses are NEVER translated here:
// they use published translations of meanings (assets/quran/tr, see SOURCES.md).
const DEMO_TR = {
  1: {
    fr: "Louange à Allah, Seigneur des mondes, et que la prière et la paix soient sur le plus noble des prophètes et des messagers. Ensuite :",
    ur: "تمام تعریفیں اللہ رب العالمین کے لیے ہیں، اور درود و سلام ہو انبیاء و رسولوں میں سب سے اشرف پر۔ اما بعد",
    id: "Segala puji bagi Allah, Tuhan semesta alam. Shalawat dan salam atas nabi dan rasul yang paling mulia. Amma ba'du.",
    tr: "Hamd, âlemlerin Rabbi Allah'a mahsustur. Salât ve selâm, peygamberlerin ve resullerin en şereflisinin üzerine olsun. Bundan sonra:",
    bn: "সমস্ত প্রশংসা জগতসমূহের প্রতিপালক আল্লাহর জন্য, এবং সালাত ও সালাম নবী ও রাসূলগণের মধ্যে সর্বশ্রেষ্ঠজনের উপর। অতঃপর:",
    ms: "Segala puji bagi Allah, Tuhan sekalian alam. Selawat dan salam ke atas nabi dan rasul yang paling mulia. Amma ba'du."
  },
  2: {
    fr: "Je vous recommande, serviteurs d'Allah, ainsi qu'à moi-même, la crainte pieuse d'Allah (taqwa) : c'est la recommandation d'Allah aux premiers comme aux derniers.",
    ur: "اللہ کے بندو! میں تمہیں اور اپنے آپ کو اللہ عزوجل کے تقویٰ کی وصیت کرتا ہوں، یہی اللہ کی وصیت ہے پہلوں اور پچھلوں کے لیے۔",
    id: "Wahai hamba-hamba Allah, aku berwasiat kepada kalian dan diriku sendiri untuk bertakwa kepada Allah. Itulah wasiat Allah bagi orang-orang terdahulu dan yang kemudian.",
    tr: "Ey Allah'ın kulları! Size ve kendime Allah'a karşı takvayı tavsiye ederim; bu, Allah'ın öncekilere ve sonrakilere tavsiyesidir.",
    bn: "হে আল্লাহর বান্দাগণ! আমি তোমাদের এবং নিজেকে আল্লাহর তাকওয়ার উপদেশ দিচ্ছি; এটিই পূর্ববর্তী ও পরবর্তী সকলের প্রতি আল্লাহর উপদেশ।",
    ms: "Wahai hamba-hamba Allah, aku berpesan kepada kamu dan diriku agar bertakwa kepada Allah. Itulah pesanan Allah kepada orang terdahulu dan yang kemudian."
  },
  3: {
    fr: "Ô croyants, les gens sont égaux devant Allah quant à leur origine et à leur création.",
    ur: "اے ایمان والو! لوگ اپنی اصل اور خلقت میں اللہ کے نزدیک برابر ہیں۔",
    id: "Wahai orang-orang beriman, manusia di sisi Allah sama dalam asal-usul dan penciptaan mereka.",
    tr: "Ey müminler! İnsanlar, asılları ve yaratılışları bakımından Allah katında eşittir.",
    bn: "হে মুমিনগণ! উৎপত্তি ও সৃষ্টির দিক থেকে মানুষ আল্লাহর কাছে সমান।",
    ms: "Wahai orang yang beriman, manusia di sisi Allah adalah sama dari segi asal usul dan kejadian mereka."
  },
  4: {
    fr: "Nul Arabe n'a de mérite sur un non-Arabe, ni un Blanc sur un Noir, si ce n'est par la piété et les bonnes œuvres.",
    ur: "کسی عربی کو عجمی پر اور کسی گورے کو کالے پر کوئی فضیلت نہیں، سوائے تقویٰ اور نیک عمل کے۔",
    id: "Tidak ada keutamaan orang Arab atas non-Arab, tidak pula orang kulit putih atas kulit hitam, kecuali dengan takwa dan amal saleh.",
    tr: "Arap'ın Arap olmayana, beyazın siyaha hiçbir üstünlüğü yoktur; üstünlük ancak takva ve salih ameldedir.",
    bn: "অনারবের উপর আরবের এবং কালোর উপর সাদার কোনো শ্রেষ্ঠত্ব নেই, তাকওয়া ও সৎকর্ম ছাড়া।",
    ms: "Tiada kelebihan orang Arab ke atas bukan Arab, dan tidak juga orang berkulit putih ke atas yang berkulit hitam, kecuali dengan takwa dan amal soleh."
  },
  6: {
    fr: "Les meilleurs des gens auprès d'Allah sont ceux qui ont le plus de piété.",
    ur: "اللہ کے نزدیک سب سے بہتر وہ ہے جو سب سے زیادہ متقی ہو۔",
    id: "Manusia yang paling utama di sisi Allah adalah yang paling bertakwa.",
    tr: "Allah katında insanların en üstünü, takvası en çok olanıdır.",
    bn: "আল্লাহর কাছে সর্বোত্তম মানুষ সে, যার তাকওয়া সবচেয়ে বেশি।",
    ms: "Manusia yang paling mulia di sisi Allah ialah yang paling bertakwa."
  },
  7: {
    fr: "Parmi les fruits de la piété : la bienfaisance envers les créatures et la douceur envers elles, en paroles et en actes.",
    ur: "تقویٰ کے ثمرات میں سے مخلوق کے ساتھ احسان اور قول و عمل میں ان کے ساتھ نرمی ہے۔",
    id: "Di antara buah takwa adalah berbuat ihsan kepada sesama makhluk dan bersikap lembut kepada mereka dalam ucapan dan perbuatan.",
    tr: "Takvanın meyvelerinden biri, insanlara ihsanda bulunmak ve söz ile davranışta onlara karşı yumuşak olmaktır.",
    bn: "তাকওয়ার ফল হলো সৃষ্টির প্রতি অনুগ্রহ এবং কথা ও কাজে তাদের প্রতি কোমলতা।",
    ms: "Antara buah takwa ialah berbuat ihsan kepada makhluk dan berlemah lembut dengan mereka dalam kata-kata dan perbuatan."
  },
  9: {
    fr: "Craignez Allah autant que vous le pouvez, et placez votre confiance en Lui dans toutes vos affaires.",
    ur: "جتنا ہو سکے اللہ سے ڈرو، اور اپنے تمام معاملات میں اسی پر بھروسہ کرو۔",
    id: "Bertakwalah kepada Allah semampu kalian, dan bertawakallah kepada-Nya dalam seluruh urusan kalian.",
    tr: "Gücünüz yettiğince Allah'tan sakının ve bütün işlerinizde O'na tevekkül edin.",
    bn: "তোমরা যথাসাধ্য আল্লাহকে ভয় করো এবং তোমাদের সকল কাজে তাঁর উপর ভরসা রাখো।",
    ms: "Bertakwalah kepada Allah sedaya upaya kamu, dan bertawakallah kepada-Nya dalam semua urusan kamu."
  },
  10: {
    fr: "Sachez que la meilleure provision est la piété, et que la meilleure œuvre est la plus constante, même si elle est petite.",
    ur: "جان لو کہ بہترین زادِ راہ تقویٰ ہے، اور بہترین عمل وہ ہے جو ہمیشہ کیا جائے چاہے تھوڑا ہو۔",
    id: "Ketahuilah bahwa sebaik-baik bekal adalah takwa, dan sebaik-baik amal adalah yang paling rutin meskipun sedikit.",
    tr: "Bilin ki azığın en hayırlısı takvadır; amelin en hayırlısı da az da olsa devamlı olanıdır.",
    bn: "জেনে রাখো, সর্বোত্তম পাথেয় হলো তাকওয়া, আর সর্বোত্তম আমল হলো যা নিয়মিত করা হয়, যদিও তা অল্প হয়।",
    ms: "Ketahuilah bahawa sebaik-baik bekalan ialah takwa, dan sebaik-baik amalan ialah yang berterusan walaupun sedikit."
  },
  11: {
    fr: "Ô Allah, place-nous parmi les pieux et les bienfaisants, et pardonne-nous, ainsi qu'à nos parents et à tous les musulmans.",
    ur: "اے اللہ! ہمیں متقیوں اور نیکوکاروں میں شامل فرما، اور ہمیں، ہمارے والدین کو اور تمام مسلمانوں کو بخش دے۔",
    id: "Ya Allah, jadikanlah kami termasuk orang-orang yang bertakwa dan berbuat ihsan, dan ampunilah kami, kedua orang tua kami, dan seluruh kaum muslimin.",
    tr: "Allah'ım! Bizi takva sahiplerinden ve muhsinlerden eyle; bizi, anne babamızı ve bütün Müslümanları bağışla.",
    bn: "হে আল্লাহ! আমাদেরকে মুত্তাকী ও সৎকর্মশীলদের অন্তর্ভুক্ত করুন, এবং আমাদের, আমাদের পিতামাতা ও সকল মুসলিমকে ক্ষমা করুন।",
    ms: "Ya Allah, jadikanlah kami dalam kalangan orang yang bertakwa dan berbuat ihsan, dan ampunilah kami, ibu bapa kami dan seluruh umat Islam."
  }
};
