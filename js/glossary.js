// sign-language glossary grid — hover previews the clip, click opens it full

(() => {
  $("#glossaryGrid").innerHTML = Object.entries(GLOSSARY).map(([key, g]) => {
    const pending = !g.video;
    const thumb = pending
      ? `<button class="term-thumb pending" disabled aria-label="المقطع قيد التوثيق">
           <span class="play-ring">
             <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
           </span>
         </button>`
      : `<button class="term-thumb has-video" data-term="${key}" aria-label="تشغيل مقطع إشارة ${key}">
           <video src="${g.video}" muted loop playsinline preload="auto"></video>
           <span class="play-ring">
             <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
           </span>
         </button>`;
    return `
    <article class="term-card">
      ${thumb}
      <div class="term-body">
        <div class="term-head">
          <span class="term-name">${key}</span>
          <span class="chip ${pending ? "chip-amber" : "chip-green"}">${g.status}</span>
        </div>
        <p class="term-def">${g.def}</p>
        <p class="term-signer">${pending ? "يُعرض المصطلح على الشاشة دون مقطع حتى يُسجَّل ويُوثَّق" : g.demo}</p>
      </div>
    </article>`;
  }).join("");

  // hover to preview
  $$("#glossaryGrid .term-thumb.has-video").forEach(btn => {
    const v = btn.querySelector("video");
    btn.addEventListener("mouseenter", () => v.play());
    btn.addEventListener("mouseleave", () => { v.pause(); v.currentTime = 0; });
  });
})();
