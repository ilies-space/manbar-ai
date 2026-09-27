// hash router, modal, toast + small helpers shared by all views

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// router
const ROUTES = {
  "": "home",
  "#/": "home",
  "#/screen": "screen",
  "#/dashboard": "dashboard",
  "#/glossary": "glossary",
  "#/impact": "impact"
};

function route() {
  const name = ROUTES[location.hash] || "home";
  document.body.dataset.view = name;
  $$(".view").forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
  $$("#nav a").forEach(a => a.classList.toggle("active", a.dataset.route === name));
  $("#nav").classList.remove("open");
  window.scrollTo({ top: 0 });

  if (name !== "screen" && window.ManbarScreen) ManbarScreen.suspend();
  if (name === "impact" && window.ManbarImpact) ManbarImpact.animate();
}
window.addEventListener("hashchange", route);

// mobile nav
$("#navToggle").addEventListener("click", () => $("#nav").classList.toggle("open"));

// modal
const modalBackdrop = $("#modalBackdrop");
const modalBody = $("#modalBody");

function openModal(html) {
  modalBody.innerHTML = html;
  modalBackdrop.hidden = false;
}
function closeModal() {
  modalBackdrop.hidden = true;
  modalBody.innerHTML = "";
}
$("#modalClose").addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", e => { if (e.target === modalBackdrop) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

function openSignModal(termKey) {
  const term = GLOSSARY[termKey];
  if (!term) return;
  const player = term.video
    ? `<div class="sign-player has-video">
         <video src="${term.video}" autoplay loop muted playsinline controls></video>
       </div>
       <p class="demo-tag">${term.demo}</p>`
    : `<div class="sign-player">
         <div class="sign-anim">
           <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
         </div>
         <span class="sign-hands">المقطع قيد التسجيل والتوثيق</span>
       </div>`;
  openModal(`
    <h3>إشارة: ${termKey}</h3>
    <p class="sub">${term.def}</p>
    ${player}
    <div class="sign-meta">
      <span><strong>في المنتج:</strong> ${term.signer}</span>
      <span><strong>الحالة:</strong> ${term.status}${term.video ? "" : " — يُعرض المصطلح دون مقطع حتى يُوثَّق"}</span>
      <span><strong>قاعدة منبر:</strong> الإشارات بشرية مسجّلة، لا يولّدها الذكاء الاصطناعي.</span>
    </div>
  `);
}

// toast
let toastTimer = null;
function showToast(msg, ms = 3200) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

// helpers
// {{glossaryKey|display}} -> clickable term chip
function renderSimple(text) {
  return text.replace(/\{\{(.+?)\|(.+?)\}\}/g,
    (_, key, display) =>
      `<button class="term-chip" data-term="${key}" title="اضغط لعرض مقطع الإشارة">${display}</button>`);
}
function plainSimple(text) {
  return text.replace(/\{\{(.+?)\|(.+?)\}\}/g, (_, k, d) => d);
}
function fmtTime(s) {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// term chips open the sign modal, wherever they are
document.addEventListener("click", e => {
  const chip = e.target.closest("[data-term]");
  if (chip) openSignModal(chip.dataset.term);
});

document.addEventListener("DOMContentLoaded", route);
