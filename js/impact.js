// impact view: comparison bars + metric tiles

const ManbarImpact = (() => {
  const m = METRICS;

  $("#compareChart").innerHTML = `
    <div class="cbar base">
      <span class="name">بدون منبر</span>
      <div class="track"><div class="fill" data-w="${m.comprehension.without}" title="بدون منبر: ${m.comprehension.without}٪"></div></div>
      <span class="val">${m.comprehension.without}٪</span>
    </div>
    <div class="cbar manbar">
      <span class="name">مع منبر</span>
      <div class="track"><div class="fill" data-w="${m.comprehension.with}" title="مع منبر: ${m.comprehension.with}٪"></div></div>
      <span class="val">${m.comprehension.with}٪</span>
    </div>`;
  $("#chartNote").textContent = m.comprehension.note;

  $("#metricTiles").innerHTML = [
    [`+${m.comprehension.with - m.comprehension.without} نقطة`, "الفهم",
      "مشاركون صم يجيبون عن أسئلة فهم بعد خطبة مع منبر وخطبة دونه."],
    [`${m.sync}٪`, "دقة التزامن",
      "نسبة الجمل التي ظهرت في وقتها الصحيح على خطب مسجّلة."],
    [`${m.signAccuracy}٪`, "دقة الإشارة",
      "نسبة الجمل التي حكم مترجم معتمد بأن ترجمتها الرقمية صحيحة وغير متأخرة عن الإمام."]
  ].map(([num, lbl, why]) => `
    <div class="mtile"><div class="num">${num}</div><div class="lbl">${lbl}</div><p class="why">${why}</p></div>
  `).join("");

  let animated = false;
  function animate() {
    // grow the bars each time the view opens
    $$("#compareChart .fill").forEach(f => {
      if (!animated) f.style.width = "0%";
      requestAnimationFrame(() => requestAnimationFrame(() => {
        f.style.width = f.dataset.w + "%";
      }));
    });
    animated = true;
  }

  return { animate };
})();
window.ManbarImpact = ManbarImpact;
