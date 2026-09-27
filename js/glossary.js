// sign-language glossary grid

(() => {
  $("#glossaryGrid").innerHTML = Object.entries(GLOSSARY).map(([key, g]) => {
    const ok = g.status === "موثق";
    return `
    <article class="term-card">
      <button class="term-thumb ${ok ? "" : "pending"}" ${ok ? `data-term="${key}"` : "disabled"}
              aria-label="${ok ? "تشغيل مقطع إشارة " + key : "المقطع قيد التوثيق"}">
        <span class="play-ring">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </span>
      </button>
      <div class="term-body">
        <div class="term-head">
          <span class="term-name">${key}</span>
          <span class="chip ${ok ? "chip-green" : "chip-amber"}">${g.status}</span>
        </div>
        <p class="term-def">${g.def}</p>
        <p class="term-signer">${ok ? g.signer : "يُعرض المصطلح على الشاشة دون مقطع حتى يُسجَّل ويُوثَّق"}</p>
      </div>
    </article>`;
  }).join("");
})();
