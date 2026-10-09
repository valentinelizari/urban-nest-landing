// Urban Nest · interacción del sitio.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp01 = v => Math.min(1, Math.max(0, v));
const usd = (n, d = 0) => "USD " + Number(n).toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mq = matchMedia("(max-width: 860px)");
const isMobile = () => mq.matches;
const mobile = isMobile() || matchMedia("(pointer: coarse)").matches;
const root = document.documentElement;

/* WhatsApp */
const WA_NUM = "5491132126888";
const waLink = msg => "https://wa.me/" + WA_NUM + "?text=" + encodeURIComponent(msg);
$$(".js-wa").forEach(a => { a.href = waLink("Hola Urban Nest, quiero un análisis de mi departamento."); a.target = "_blank"; a.rel = "noopener"; });

/* Día y noche */
let tour = null;
const themeBtn = $("#themeBtn");
const isNight = () => root.dataset.theme === "night";
function syncThemeBtn() {
  themeBtn.setAttribute("aria-label", isNight() ? "Cambiar a modo día" : "Cambiar a modo noche");
  $('meta[name="theme-color"]').content = isNight() ? "#120B0F" : "#8B1D3D";
}
themeBtn.addEventListener("click", () => {
  root.dataset.theme = isNight() ? "day" : "night";
  try { localStorage.setItem("un-theme", root.dataset.theme); } catch (e) {}
  syncThemeBtn();
  if (tour) tour.setNight(isNight(), reduce);
});
syncThemeBtn();

/* Menú mobile */
const sheet = $("#sheet"), menuBtn = $("#menuBtn");
function setSheet(open) {
  sheet.hidden = !open; menuBtn.setAttribute("aria-expanded", open);
  menuBtn.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
  document.body.style.overflow = open ? "hidden" : "";
  hdr.classList.toggle("solid", open || hdrSolid);
}
menuBtn.addEventListener("click", () => setSheet(sheet.hidden));
sheet.addEventListener("click", e => { if (e.target.closest("a")) setSheet(false); });
addEventListener("keydown", e => { if (e.key === "Escape" && !sheet.hidden) setSheet(false); });

/* ───────── Recorrido 3D ───────── */
const tourEl = $("#tour"), canvas = $("#tourCanvas"), flash = $("#tourFlash"), bar = $("#tourBar");
const panels = $$(".tp", tourEl), chapters = $$(".chapters li", tourEl);
const inRange = (el, p) => p >= +el.dataset.from && p < +el.dataset.to;

(async () => {
  try {
    const gl = document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl");
    if (!gl) throw new Error("sin webgl");
    const { createTour } = await import("./tour.js");
    tour = createTour({ canvas, mobile, reduce, night: isNight() });
    if (!tour) throw new Error("sin renderer");
    tour.setLabels($$(".pin", tourEl));
    tour.setAuto(isMobile());
    tour.setProgress(tourProgress());
    tour.start();
    mq.addEventListener("change", () => { tour.setAuto(isMobile()); onScroll(); });
    if (isMobile()) requestAnimationFrame(autoLoop);
    new IntersectionObserver(([e]) => tour.setVisible(e.isIntersecting)).observe(tourEl);
  } catch (e) {
    root.classList.add("no-webgl");
  }
})();

function tourProgress() {
  const r = tourEl.getBoundingClientRect();
  return clamp01(-r.top / (r.height - innerHeight));
}
const cap = $("#tourCap");
let capText = "";
function paintTour(p) {
  chapters.forEach(el => el.classList.toggle("on", inRange(el, p)));
  bar.style.transform = `scaleX(${p})`;
  // Destello cálido al atravesar la ventana
  flash.style.opacity = clamp01(1 - Math.abs(p - 0.6) / 0.035);
  const on = chapters.find(el => inRange(el, p));
  if (on && on.dataset.cap !== capText) { capText = on.dataset.cap; cap.classList.remove("in"); void cap.offsetWidth; cap.textContent = capText; cap.classList.add("in"); }
}
function updateTour() {
  if (isMobile()) return;
  const p = tourProgress();
  if (tour) tour.setProgress(p);
  panels.forEach(el => el.classList.toggle("on", inRange(el, p)));
  paintTour(p);
}
// En mobile la escena se reproduce sola, como un video de portada.
function autoLoop() {
  if (!isMobile() || !tour) return;
  paintTour(tour.getProgress());
  requestAnimationFrame(autoLoop);
}

/* ───────── Servicios: scroll horizontal ───────── */
const STEPS = [
  { w: "Todos los días", t: "Precio y calendario", h: "La tarifa correcta para cada noche.", p: "Ajustamos precios según temporada, día de la semana, eventos y anticipación. El calendario siempre al día para no perder noches.", l: ["Revisión de tarifas y estadías mínimas", "Precios especiales en fechas de alta demanda", "Bloqueo de fechas cuando querés usarlo"], o: "Si querés usar el departamento, nos avisás y bloqueamos las fechas." },
  { w: "Al reservar", t: "Llega la reserva", h: "Respuesta en menos de una hora.", p: "Respondemos consultas y confirmamos reservas al instante. Revisamos el perfil del huésped y le damos la bienvenida.", l: ["Respuesta al 100% de los mensajes", "Revisión del perfil y las reseñas del huésped", "Bienvenida con las normas de la casa"], o: "Nada. Te enterás en el reporte del mes." },
  { w: "48 horas antes", t: "Antes de la llegada", h: "Todo listo antes de que llegue.", p: "Registramos al huésped en el edificio cuando hace falta y le enviamos las instrucciones de llegada paso a paso.", l: ["Registro en recepción si el edificio lo pide", "Instrucciones de acceso y wifi", "Confirmación del horario de llegada"], o: "Nada." },
  { w: "Día de llegada", t: "Check in", h: "Recibimos a cada huésped.", p: "Hacemos el check in en persona: lo esperamos en el departamento, le entregamos las llaves y le mostramos todo lo que necesita para su estadía.", l: ["Recepción en el departamento", "Entrega de llaves y recorrida", "Asistencia si algo falla durante la llegada"], o: "Nada. Nunca más una entrega de llaves." },
  { w: "Mientras se aloja", t: "Durante la estadía", h: "Disponibles a cualquier hora.", p: "Resolvemos dudas, recomendamos lugares y coordinamos cualquier arreglo. En estadías largas coordinamos el recambio de ropa de cama.", l: ["Atención por mensaje en cualquier horario", "Coordinación de técnicos si algo se rompe", "Recambio de ropa de cama en estadías largas"], o: "Solo te consultamos los arreglos que necesitan tu aprobación." },
  { w: "Día de salida", t: "Salida y limpieza", h: "Listo para el próximo huésped.", p: "Coordinamos la limpieza, gestionamos la lavandería de toda la ropa de cama y toallas, reponemos lo necesario y revisamos el estado del departamento después de cada estadía.", l: ["Limpieza profesional después de cada huésped", "Gestión de lavandería: ropa de cama y toallas", "Control del estado y reporte de daños"], o: "Nada. La limpieza la paga el huésped." },
  { w: "Después de la salida", t: "Reseña", h: "Cada reseña cuenta.", p: "Calificamos al huésped y respondemos su reseña. Las buenas calificaciones mejoran la posición del anuncio y permiten subir la tarifa.", l: ["Calificación del huésped", "Respuesta a los comentarios", "Seguimiento de las categorías a mejorar"], o: "Nada." },
  { w: "Primeros días del mes", t: "Reporte y liquidación", h: "Tu dinero, con el detalle completo.", p: "Cada mes recibís el reporte de rendimiento y la liquidación con cada reserva, los gastos y el total a transferir.", l: ["Ocupación, tarifa promedio y calificación", "Detalle por reserva y gastos del mes", "Transferencia en dólares o en pesos"], o: "Recibís el reporte y la transferencia." },
];
const hsEl = $("#reserva"), hsTrack = $("#hsTrack"), hsBar = $("#hsBar");
hsTrack.innerHTML = STEPS.map((s, i) => `<li class="hs-card"><span class="n">0${i + 1}</span><span class="when">${s.w}</span><h3>${s.h}</h3><p>${s.p}</p><ul>${s.l.map(x => `<li>${x}</li>`).join("")}</ul><p class="you"><b>Vos:</b> ${s.o}</p></li>`).join("");
hsTrack.addEventListener("scroll", () => { if (isMobile()) hsBar.style.transform = `scaleX(${hsTrack.scrollLeft / Math.max(1, hsTrack.scrollWidth - hsTrack.clientWidth)})`; }, { passive: true });
function updateHs() {
  if (isMobile()) { hsTrack.style.transform = ""; return; }
  const r = hsEl.getBoundingClientRect(), p = clamp01(-r.top / (r.height - innerHeight));
  const max = hsTrack.scrollWidth - innerWidth;
  hsTrack.style.transform = `translate3d(${-p * Math.max(0, max)}px,0,0)`;
  hsBar.style.transform = `scaleX(${p})`;
}

/* ───────── Resultados ───────── */
const PHOTOS = {
  obe: [["/assets/img/obe.jpg", "Living del Urban Nest Obelisco"]],
  oll: [["/assets/img/oll/1.jpg", "Dormitorio con ventana del Urban Nest Olleros"], ["/assets/img/oll/2.jpg", "Cama y escritorio"], ["/assets/img/oll/3.jpg", "Escritorio y televisor"], ["/assets/img/oll/4.jpg", "Cocina equipada"], ["/assets/img/oll/5.jpg", "Baño completo"]],
  acu: [["/assets/img/acu/1.jpg", "Living comedor con ventanal a la terraza del Urban Nest Acuña"], ["/assets/img/acu/2.jpg", "Living con escalera al dormitorio"], ["/assets/img/acu/3.jpg", "Comedor luminoso"], ["/assets/img/acu/4.jpg", "Dormitorio"], ["/assets/img/acu/5.jpg", "Cama doble"], ["/assets/img/acu/6.jpg", "Baño completo"]],
};
const PROPS = [
  { k: "obe", name: "Urban Nest Obelisco", where: "Studio en Av. Corrientes y Callao · 2 huéspedes", badge: "Favorito entre huéspedes", tag: "De anuncio nuevo a Favorito entre huéspedes en menos de un año.", rating: "4,95", reviews: 58, extra: "5,0 en limpieza, veracidad y comunicación" },
  { k: "oll", name: "Urban Nest Olleros", where: "Suite con entrada independiente en Las Cañitas · 2 huéspedes", badge: "En crecimiento", tag: "23 reseñas en sus primeros cinco meses, con 5,0 en comunicación y ubicación.", rating: "4,83", reviews: 23, extra: "4,9 en llegada" },
  { k: "acu", name: "Urban Nest Acuña", where: "Dúplex con terraza privada en Palermo · 4 huéspedes", badge: "Ideal para grupos", tag: "Un dúplex para grupos con 5,0 en llegada, comunicación y ubicación.", rating: "4,75", reviews: 40, extra: "4,9 en veracidad" },
];
const img = (src, alt, eager) => `<img src="${src}" alt="${alt}" ${eager ? "" : 'loading="lazy"'} decoding="async">`;
$("#storyMedia").innerHTML = PROPS.map((p, i) => `<div class="sm ${i ? "" : "on"}" data-k="${p.k}">${PHOTOS[p.k].map((f, j) => `<figure class="sm-f ${j ? "" : "on"}">${img(f[0], f[1])}</figure>`).join("")}<span class="sm-n">${PHOTOS[p.k].length > 1 ? `1 / ${PHOTOS[p.k].length}` : ""}</span></div>`).join("");
$("#stories").innerHTML = PROPS.map(p => `<article class="st" data-k="${p.k}"><div class="st-gal" aria-label="Fotos de ${p.name}">${PHOTOS[p.k].map(f => img(f[0], f[1])).join("")}</div><span class="badge">${p.badge}</span><h3>${p.name}</h3><p class="where">${p.where}</p><p class="tag">${p.tag}</p><div class="score"><b class="num">${p.rating}★</b><span>${p.reviews} reseñas<br>${p.extra}</span></div></article>`).join("");
const media = $$(".sm");
let activeK = "obe";
const stObs = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { activeK = e.target.dataset.k; media.forEach(m => m.classList.toggle("on", m.dataset.k === activeK)); }
}), { rootMargin: "-45% 0px -45% 0px" });
$$(".st").forEach(s => stObs.observe(s));
// Las fotos del departamento activo pasan solas
if (!reduce) setInterval(() => {
  if (isMobile() || document.hidden) return;
  const m = media.find(x => x.dataset.k === activeK), fs = $$(".sm-f", m);
  if (fs.length < 2 || m.getBoundingClientRect().bottom < 0) return;
  const i = fs.findIndex(f => f.classList.contains("on")), n = (i + 1) % fs.length;
  fs[i].classList.remove("on"); fs[n].classList.add("on");
  $(".sm-n", m).textContent = `${n + 1} / ${fs.length}`;
}, 3400);

// Reseñas reales de Airbnb: { t: "texto", who: "Nombre", from: "Ciudad", when: "septiembre 2026", k: "obe" }
const REVIEWS = [];
if (REVIEWS.length) {
  const q = $("#quotes"); q.hidden = false;
  const nm = { obe: "Obelisco", oll: "Olleros", acu: "Acuña" };
  q.innerHTML = `<h3 class="mid">Lo que escriben en sus reseñas.</h3><div class="q-track">${REVIEWS.map(r => `<figure class="q"><blockquote>“${r.t}”</blockquote><figcaption><b>${r.who}</b>${r.from ? ", " + r.from : ""} · ${nm[r.k]} · ${r.when}</figcaption></figure>`).join("")}</div>`;
}

const CATS = [["Limpieza", 5.0, 4.8, 4.8], ["Veracidad", 5.0, 4.6, 4.9], ["Llegada", 4.9, 4.9, 5.0], ["Comunicación", 5.0, 5.0, 5.0], ["Ubicación", 4.9, 5.0, 5.0], ["Calidad y precio", 4.9, 4.7, 4.8]];
const pos = v => ((v - 4.5) / 0.5 * 100).toFixed(1) + "%";
$("#dotplot").innerHTML = `<div class="dots-axis"><span></span><div><span>4,5</span><span>5,0</span></div></div>` +
  CATS.map(c => `<div class="dl"><span>${c[0]}</span><div class="scale">${["obe", "oll", "acu"].map((k, i) => `<i class="dot ${k}" data-left="${pos(c[i + 1])}" style="left:0" title="${PROPS[i].name}: ${String(c[i + 1].toFixed(1)).replace(".", ",")}"></i>`).join("")}</div></div>`).join("") +
  `<div class="dots-key"><span><i class="dot-k" style="background:var(--crimson)"></i>Obelisco</span><span><i style="background:var(--rose-2)"></i>Olleros</span><span><i style="background:var(--sand)"></i>Acuña</span></div>`;

/* ───────── Números ───────── */
const YEAR = [297, 312, 855, 710, 578, 487, 676, 676, 818, 1014, 1098, 507];
const MN = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const yMax = 1200;
$("#yearBars").innerHTML = `<div class="plot">${YEAR.map((v, i) => `<div class="col ${v < 495 ? "low" : ""}"><i style="height:${v / yMax * 100}%;transition-delay:${i * 60}ms"></i><b style="bottom:calc(${v / yMax * 100}% + 6px);transition-delay:${600 + i * 60}ms">${v.toLocaleString("es-AR")}</b></div>`).join("")}<div class="trad" style="bottom:${495 / yMax * 100}%"><em>Tradicional: USD 495 por mes</em></div></div><div class="mlabels">${MN.map(m => `<span>${m}</span>`).join("")}</div>`;

// Mes de ejemplo
const EX = [["Lucía M.", 4, 6, 126], ["Tomás R.", 7, 8, 68], ["Camila y Joaquín", 9, 15, 392], ["Familia Ferreira", 16, 21, 318], ["Martín G.", 22, 24, 130], ["Sofía L.", 24, 26, 124], ["Diego P.", 26, 27, 60]];
function calHTML(year, month, isOcc, label, clickable) {
  const days = new Date(year, month + 1, 0).getDate(), first = (new Date(year, month, 1).getDay() + 6) % 7;
  let h = ["L", "M", "X", "J", "V", "S", "D"].map(d => `<div class="dow">${d}</div>`).join("");
  for (let i = 0; i < first; i++) h += "<div></div>";
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month, d).getDay(), wk = dow === 5 || dow === 6, o = isOcc(d);
    const inner = `${d}${label ? `<small>${label(d)}</small>` : ""}`;
    h += clickable ? `<button type="button" class="d ${o ? "occ" : ""} ${wk ? "wknd" : ""}" data-d="${d}" aria-pressed="${o}" aria-label="${d}, ${o ? "reservado" : "libre"}">${inner}</button>`
                   : `<div class="d" data-d="${d}">${inner}</div>`;
  }
  return h;
}
$("#monthCal").innerHTML = calHTML(2026, 8, () => false);
$("#rcList").innerHTML = EX.map(s => `<div class="rc-item"><div>${s[0]}<small>${String(s[1]).padStart(2, "0")}/09 al ${String(s[2]).padStart(2, "0")}/09</small></div><span class="n">${s[2] - s[1]} ${s[2] - s[1] === 1 ? "noche" : "noches"}</span><span class="v">${usd(s[3])}</span></div>`).join("");
const monthEl = $("#month"), mDays = $$("#monthCal .d"), rcItems = $$(".rc-item"), rcAt = $$("#receipt [data-at]");
const mNights = $("#mNights"), mOcc = $("#mOcc"), rcGross = $("#rcGross");
let monthAuto = -1;
new IntersectionObserver(([e]) => {
  if (!e.isIntersecting || !isMobile() || monthAuto >= 0) return;
  monthAuto = 0; const t0 = performance.now();
  const step = t => { monthAuto = reduce ? 1 : clamp01((t - t0) / 3800); updateMonth(); if (monthAuto < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}, { threshold: 0.35 }).observe(monthEl);
function updateMonth() {
  const r = monthEl.getBoundingClientRect();
  const p = isMobile() ? Math.max(0, monthAuto) : clamp01((-r.top) / (r.height - innerHeight) * 1.05);
  const fill = clamp01(p / 0.72), stays = Math.floor(fill * EX.length + 0.0001);
  let nights = 0, gross = 0;
  EX.forEach((s, i) => {
    const on = i < stays || (fill >= 1);
    if (on) { nights += s[2] - s[1]; gross += s[3]; }
    rcItems[i].classList.toggle("on", on);
  });
  const occ = new Set(); EX.slice(0, fill >= 1 ? EX.length : stays).forEach(s => { for (let d = s[1]; d < s[2]; d++) occ.add(d); });
  mDays.forEach(el => el.classList.toggle("occ", occ.has(+el.dataset.d)));
  mNights.textContent = nights; mOcc.textContent = Math.round(nights / 30 * 100) + "%";
  rcGross.textContent = usd(gross);
  rcAt.forEach(el => el.classList.toggle("on", p >= +el.dataset.at));
}

/* ───────── Simulador ───────── */
const SEASON = [[40, 11], [42, 11], [55, 23], [50, 21], [45, 19], [45, 16], [50, 20], [50, 20], [55, 22], [60, 25], [65, 25], [50, 15]];
const MNAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const TYPES = [{ l: "Monoambiente", f: 1, trad: 495 }, { l: "1 dormitorio", f: 1.18, trad: 550 }, { l: "2 dormitorios", f: 1.55, trad: 700 }];
const AIRBNB = 0.155, UN = 0.20;
const now = new Date();
const state = { type: 0, month: (now.getMonth() + 1) % 12, rate: 1, trad: TYPES[0].trad, booked: null, edited: false };
let simSummary = "";
const yearOf = m => (m < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear());
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function projected(m) {
  const y = yearOf(m), days = new Date(y, m + 1, 0).getDate(), r = rng(m * 97 + 11), W = [0.55, 0.45, 0.45, 0.45, 0.7, 1, 1];
  const scored = []; for (let d = 1; d <= days; d++) scored.push([d, W[new Date(y, m, d).getDay()] + r() * 0.6]);
  scored.sort((a, b) => b[1] - a[1]);
  return new Set(scored.slice(0, SEASON[m][1]).map(x => x[0]));
}
const nightPrice = (m, d) => { const dow = new Date(yearOf(m), m, d).getDay(); return SEASON[m][0] * TYPES[state.type].f * state.rate * (dow === 5 || dow === 6 ? 1.12 : 0.95); };
const calc = (m, set) => { let g = 0; set.forEach(d => g += nightPrice(m, d)); const f = g * AIRBNB, u = (g - f) * UN; return { g, f, u, o: g - f - u, n: set.size }; };
const typeSeg = $("#typeSeg"), monthBtns = $("#monthBtns"), tradIn = $("#tradIn");
typeSeg.innerHTML = TYPES.map((t, i) => `<button type="button" aria-pressed="${i === 0}" data-i="${i}">${t.l}</button>`).join("");
monthBtns.innerHTML = MNAMES.map((m, i) => `<button type="button" aria-pressed="${i === state.month}" data-i="${i}">${m.slice(0, 3)}</button>`).join("");
tradIn.value = state.trad;
function renderSim() {
  const m = state.month, y = yearOf(m), r = calc(m, state.booked), days = new Date(y, m + 1, 0).getDate();
  $("#simCal").innerHTML = calHTML(y, m, d => state.booked.has(d), d => "$" + Math.round(nightPrice(m, d)), true);
  $("#calTitle").textContent = `${MNAMES[m]} ${y} · ${r.n} noches (${Math.round(r.n / days * 100)}%)`;
  $("#resetCal").hidden = !state.edited;
  $("#rateOut").textContent = usd(r.n ? r.g / r.n : SEASON[m][0] * TYPES[state.type].f * state.rate);
  $("#rOwner").textContent = usd(r.o);
  $("#rSub").textContent = `${TYPES[state.type].l} · ${MNAMES[m].toLowerCase()} · ${r.n} noches`;
  $("#rTrad").textContent = usd(state.trad);
  const pct = state.trad ? Math.round((r.o / state.trad - 1) * 100) : 0;
  $("#rDiff").textContent = pct >= 0 ? `${pct}% más` : `${Math.abs(pct)}% menos`;
  $("#rBrk").innerHTML = `
    <div class="ln"><span>Lo que pagan los huéspedes por las noches</span><span>${usd(r.g)}</span></div>
    <div class="ln"><span>Se descuenta la tarifa de Airbnb (15,5%)<small>La cobra la plataforma en todos los anuncios.</small></span><span>${usd(r.f)}</span></div>
    <div class="ln"><span>Se descuenta la gestión Urban Nest (20%)<small>Precios, huéspedes, ingreso, limpieza coordinada, mantenimiento y reportes.</small></span><span>${usd(r.u)}</span></div>
    <div class="ln t"><span>Para vos</span><span>${usd(r.o)}</span></div>
    <div class="ln"><span><small>La limpieza la paga el huésped aparte y no sale de tu ingreso.</small></span><span></span></div>`;
  simSummary = `Simulador: ${TYPES[state.type].l}, ${MNAMES[m].toLowerCase()}, ${usd(r.o)} para el propietario.`;
}
function setMonth(m) { state.month = m; state.booked = projected(m); state.edited = false; $$("button", monthBtns).forEach((b, i) => b.setAttribute("aria-pressed", i === m)); renderSim(); }
typeSeg.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; state.type = +b.dataset.i; state.trad = TYPES[state.type].trad; tradIn.value = state.trad; $$("button", typeSeg).forEach(x => x.setAttribute("aria-pressed", x === b)); renderSim(); });
monthBtns.addEventListener("click", e => { const b = e.target.closest("button"); if (b) setMonth(+b.dataset.i); });
$("#rate").addEventListener("input", e => { state.rate = +e.target.value; renderSim(); });
tradIn.addEventListener("input", () => { const v = +tradIn.value; if (v >= 50) { state.trad = v; renderSim(); } });
$("#simCal").addEventListener("click", e => { const b = e.target.closest("button.d"); if (!b) return; const d = +b.dataset.d; state.booked.has(d) ? state.booked.delete(d) : state.booked.add(d); state.edited = true; renderSim(); });
$("#resetCal").addEventListener("click", () => setMonth(state.month));
state.booked = projected(state.month);
renderSim();

/* ───────── Comparación, equipamiento y pasos ───────── */
const CMP = [
  ["Ingreso anual estimado", "USD 5.940", "USD 8.029"],
  ["Moneda", "Pesos, con ajuste por índice", "Dólares, a tarifa de mercado"],
  ["Contrato", "Varios años, difícil de modificar", "Sin inquilino fijo"],
  ["Riesgo de impago", "Existe, y el desalojo es lento", "Airbnb cobra antes de cada estadía"],
  ["Estado del inmueble", "Se revisa al final del contrato", "Limpieza y control después de cada huésped"],
  ["Uso propio", "No", "Bloqueás fechas cuando quieras usarlo"],
  ["Servicios y expensas", "Los paga el inquilino", "Los pagás vos, cubiertos por el ingreso extra"],
];
$("#cmp").innerHTML = `<div class="cmp-r cmp-h" role="row"><span role="columnheader"></span><span class="a" role="columnheader">Alquiler tradicional</span><span class="b" role="columnheader">Con Urban Nest</span></div>` +
  CMP.map(r => `<div class="cmp-r rv" role="row"><span class="k" role="rowheader">${r[0]}</span><span class="a" role="cell">${r[1]}</span><span class="b" role="cell">${r[2]}</span></div>`).join("");

const KIT = [["Cocina y electro", "Heladera, microondas, pava, tostadora, vajilla y batería", 830], ["Living y comedor", "Sillón, Smart TV 43\", desayunador y cortina roller", 950], ["Dormitorio y baño", "Sommier queen, mesitas, blackout y set de baño", 660], ["Textiles y extras", "Juego de blanquería, edredón, toallas y plancha", 575], ["Puesta a punto", "Limpieza profunda y service de aire acondicionado", 150]];
$("#kit").innerHTML = KIT.map(k => `<li><b>${k[0]}</b><span>${k[1]}</span><em>${usd(k[2])}</em></li>`).join("") + `<li class="tot"><b>Total estimado</b><em>${usd(3165)}</em><span>Precios de referencia de mercado.</span></li>`;

const START = [["Contacto", "Hablamos de tu propiedad y de lo que esperás de ella. Te mandamos el análisis por WhatsApp."], ["Visita", "Recorremos el departamento y evaluamos su potencial."], ["Plan de mejoras", "Definimos qué equipar o ajustar para que rinda más."], ["Anuncio", "Fotos profesionales y publicación optimizada."], ["Facturación", "Llegan los huéspedes y, cada mes, tu liquidación."]];
$("#steps").insertAdjacentHTML("beforeend", START.map((s, i) => `<li class="step"><span class="dot">${i + 1}</span><h3>${s[0]}</h3><p>${s[1]}</p></li>`).join(""));
const stepsEl = $("#steps"), stepsFill = $("#stepsFill"), stepItems = $$(".step");
function updateSteps() {
  const r = stepsEl.getBoundingClientRect(), mid = innerHeight * 0.6;
  const p = clamp01((mid - r.top) / r.height);
  stepsFill.style.transform = `scaleY(${p})`;
  stepItems.forEach(s => s.classList.toggle("on", s.getBoundingClientRect().top < mid));
}

/* ───────── Apariciones ───────── */
const io = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  const t = e.target; t.classList.add("in");
  if (t.classList.contains("year-chart")) $(".bars", t).classList.add("in");
  if (t.id === "dotplot") $$(".dot", t).forEach(d => d.style.left = d.dataset.left);
  const c = t.querySelector("[data-count]"); if (c) countUp(c);
  io.unobserve(t);
}), { threshold: 0.18 });
$$(".rv").forEach(el => io.observe(el));
function countUp(el) {
  const end = +el.dataset.count, pre = el.dataset.prefix || "", suf = el.dataset.suffix || "";
  if (reduce) { el.textContent = pre + end + suf; return; }
  const t0 = performance.now();
  const step = t => { const k = clamp01((t - t0) / 1400), e = 1 - Math.pow(1 - k, 3); el.textContent = pre + Math.round(end * e) + suf; if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/* ───────── Header, barra mobile y navegación activa ───────── */
const hdr = $("#hdr"), mbar = $("#mbar"), contactSec = $("#contacto");
let hdrSolid = false, lastY = scrollY, goingUp = true;
const navLinks = $$(".nav a"), navTargets = navLinks.map(a => $(a.getAttribute("href")));
function updateChrome() {
  const tr = tourEl.getBoundingClientRect();
  hdrSolid = isMobile() ? scrollY > 24 : tr.bottom < innerHeight * 0.5;
  hdr.classList.toggle("solid", hdrSolid || !sheet.hidden);
  const cr = contactSec.getBoundingClientRect();
  const pinned = [hsEl, monthEl].some(el => { const r = el.getBoundingClientRect(); return r.top <= 1 && r.bottom >= innerHeight - 1; });
  // La barra aparece al subir y se esconde al bajar, para no tapar el contenido.
  if (Math.abs(scrollY - lastY) > 6) { goingUp = scrollY < lastY; lastY = scrollY; }
  mbar.classList.toggle("show", tr.bottom < innerHeight * 0.4 && cr.top > innerHeight * 0.85 && !pinned && goingUp);
  let cur = -1; navTargets.forEach((t, i) => { if (t && t.getBoundingClientRect().top < innerHeight * 0.4) cur = i; });
  navLinks.forEach((a, i) => a.classList.toggle("on", i === cur));
}

let ticking = false;
function onScroll() {
  if (ticking) return; ticking = true;
  requestAnimationFrame(() => { ticking = false; updateTour(); updateHs(); updateMonth(); updateSteps(); updateChrome(); });
}
addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", onScroll);
onScroll();

/* ───────── Formulario → Supabase (función pública registrar_lead_publico) ───────── */
const SB_URL = "https://ezocccljyweieyafndhb.supabase.co";
const SB_KEY = "sb_publishable_EL2bLfMgMzKlesMvfc77ig_inCyeZ50";
const leadForm = $("#leadForm"), lfErr = $("#lfErr"), lfBtn = $("#lfBtn");
const okContact = v => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v) || (v.replace(/\D/g, "").length >= 8 && v.replace(/\D/g, "").length <= 15);
function showErr(msg, field) {
  lfErr.textContent = msg; lfErr.hidden = !msg;
  $$("[aria-invalid]", leadForm).forEach(el => el.removeAttribute("aria-invalid"));
  if (field) { field.setAttribute("aria-invalid", "true"); field.focus(); }
}
leadForm.addEventListener("submit", async e => {
  e.preventDefault();
  const f = leadForm.elements, nombre = f.nombre.value.trim(), contacto = f.contacto.value.trim();
  if (nombre.length < 2) return showErr("Ingresá tu nombre.", f.nombre);
  if (!okContact(contacto)) return showErr("Ingresá un WhatsApp con código de área o un email válido.", f.contacto);
  showErr("");
  const opt = f.tipo.selectedOptions[0];
  const label = lfBtn.textContent; lfBtn.disabled = true; lfBtn.textContent = "Enviando…";
  try {
    const res = await fetch(SB_URL + "/rest/v1/rpc/registrar_lead_publico", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: "Bearer " + SB_KEY },
      body: JSON.stringify({
        p_nombre: nombre, p_contacto: contacto,
        p_barrio: f.barrio.value.trim() || null,
        p_tipo: f.tipo.value || null, p_ambientes: (opt && opt.dataset.amb) || null,
        p_mensaje: [f.mensaje.value.trim(), simTouched ? simSummary : ""].filter(Boolean).join("\n") || null,
        p_origen: simTouched ? "landing · simulador" : "landing",
        p_trampa: f.web.value || null,
      }),
    });
    if (!res.ok) {
      let msg = "No pudimos enviar tus datos. Probá de nuevo o escribinos por WhatsApp.";
      try { const j = await res.json(); if (j && j.message && res.status === 400) msg = j.message; } catch (_) {}
      throw new Error(msg);
    }
    $("#leadFormWrap").hidden = true;
    const ok = $("#leadOk");
    $("#leadOkTitle").textContent = "¡Listo, " + nombre.split(/\s+/)[0] + "!";
    ok.hidden = false; ok.focus({ preventScroll: true });
    ok.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  } catch (err) {
    showErr(err.message || "No pudimos enviar tus datos. Probá de nuevo.");
  } finally {
    lfBtn.disabled = false; lfBtn.textContent = label;
  }
});
leadForm.addEventListener("input", e => { if (e.target.getAttribute("aria-invalid")) e.target.removeAttribute("aria-invalid"); });
let simTouched = false;
$("#simulador").addEventListener("click", () => { simTouched = true; });
$("#simulador").addEventListener("input", () => { simTouched = true; });
