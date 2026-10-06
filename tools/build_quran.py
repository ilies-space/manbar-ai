# Build Minbar's Quran data from the approved sources (see SOURCES.md):
#  - Mushaf text: King Fahd Glorious Quran Printing Complex (KFGQPC) Uthmani Hafs v13
#  - Tafsir: التفسير الميسر (King Fahd Complex)
#  - Translations of meanings: editions published by the King Fahd Complex where available
# Copies taken from github.com/fawazahmed0/quran-api (editions list names each original source).
import json, re, os
OUT = os.environ.get("QURAN_OUT", "assets/quran")
TASH = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ࣰۭ-ࣲـ]")
def norm(s):
    s = TASH.sub("", s)
    s = re.sub("[إأآٱ]", "ا", s).replace("ى", "ي").replace("ة", "ه").replace("ؤ", "و").replace("ئ", "ي")
    s = re.sub(r"[^ء-ي\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()
# the copy inserts a stray space between an (open) tanween and the following alef / alef maqsura
FIX = re.compile(r"([ࣰ-ًࣲ-ٍ]) (?=[اى](?:[ؐ-ًؚ-ٰٟۖ-ۭ]*)(?:\s|‏|$))")
def fix(t): return FIX.sub(r"\1", t).replace("‏", "").strip()

load = lambda e: json.load(open(e + ".json"))["quran"]
uth, simple, muy = load("ara-quranuthmanihaf"), load("ara-quransimple"), load("ara-kingfahadquranc")
info = json.load(open("info.json"))["chapters"]
names = [TASH.sub("", c["arabicname"]).replace("سورة", "").strip() for c in info]

# search index (internal only — displayed text always comes from the KFGQPC mushaf)
idx = [[v["chapter"], v["verse"], norm(v["text"])] for v in simple]
json.dump({"names": names, "v": idx}, open(f"{OUT}/index.json", "w"), ensure_ascii=False, separators=(",", ":"))

by = {}
for u, m in zip(uth, muy):
    assert (u["chapter"], u["verse"]) == (m["chapter"], m["verse"])
    by.setdefault(u["chapter"], []).append({"a": u["verse"], "t": fix(u["text"]), "m": m["text"].strip()})
for s, ayat in by.items():
    json.dump({"s": s, "name": names[s - 1], "ayat": ayat}, open(f"{OUT}/s/{s:03d}.json", "w"), ensure_ascii=False, separators=(",", ":"))

TR = {
  "en": ("eng-muhammadtaqiudd", "Muhammad Taqi-ud-Din al-Hilali & Muhammad Muhsin Khan — King Fahd Complex"),
  "fr": ("fra-muhammadhamidul", "Muhammad Hamidullah — édition du Complexe Roi Fahd"),
  "ur": ("urd-muhammadjunagar", "محمد جوناگڑھی — شاہ فہد قرآن کمپلیکس"),
  "id": ("ind-kingfahdcomplex", "Terjemahan Kompleks Raja Fahd"),
  "bn": ("ben-abubakrzakaria", "আবু বকর জাকারিয়া — বাদশাহ ফাহদ কুরআন মুদ্রণ কমপ্লেক্স"),
  "tr": ("tur-diyanetisleri", "Diyanet İşleri Başkanlığı Meali"),
  "ms": ("msa-abdullahmuhamma", "Abdullah Muhammad Basmeih"),
}
for lang, (ed, src) in TR.items():
    v = load(ed)
    json.dump({"source": src, "v": [x["text"].strip() for x in v]}, open(f"{OUT}/tr/{lang}.json", "w"), ensure_ascii=False, separators=(",", ":"))
print(names[:5], names[48], names[32])
