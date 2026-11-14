import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../.claude/skills/anatomy/kit/iso-kit.mjs";
import { kitScript } from "../../.claude/skills/anatomy/scripts/inline-kit.mjs";
import { MODEL, splitOf } from "./model.mjs";
import { STOPS, LADDER, EIT, eitPlotOf, OVERVIEW, LOOP, CPT, SYNC, HOLD } from "./guide.mjs";
import { WIDTH, HEIGHT, P, sceneSvg } from "./scene.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const svg = sceneSvg();

const live = `
const P = ${JSON.stringify(P)};
const MODEL = ${JSON.stringify(MODEL)};
const STOPS = ${JSON.stringify(STOPS)};
const LADDER = ${JSON.stringify(LADDER)};
const SYNC = ${JSON.stringify(SYNC)};
const HOLD = ${JSON.stringify(HOLD)};
const EIT = ${JSON.stringify(EIT)};
const LOOP = ${JSON.stringify(LOOP)};
const CPT = ${JSON.stringify(CPT)};
const OVERVIEW = ${JSON.stringify(OVERVIEW)};
${splitOf.toString()}
${eitPlotOf.toString()}
const STEP_TIME = window.__STEP || 13;
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const beam = svg.querySelector('[data-part="beam"]');
const atoms = svg.querySelector(".rx-atoms");
const spot = svg.querySelector(".rx-spot");
const readout = document.querySelector("[data-readout]");
const slider = document.getElementById("rx-field");
const sliderOut = document.getElementById("rx-field-out");
const toggle = null;
const guide = {
  step: document.getElementById("rx-step"),
  root: document.querySelector(".rx-guide"),
  title: document.getElementById("rx-title"),
  text: document.getElementById("rx-text"),
  diagram: document.getElementById("rx-diagram"),
  progress: document.getElementById("rx-progress"),
  play: document.getElementById("rx-play"),
  prev: document.getElementById("rx-prev"),
  next: document.getElementById("rx-next"),
  all: document.getElementById("rx-all"),
  chips: [...document.querySelectorAll(".rx-chip")],
};
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const FREE = [0.3, 1.6, 3.2, 1.0];
let field = 0.3, fieldTarget = field, openTarget = 0, lift = { at: 0, rate: 0 };
let frame = 0, last = 0, clock = 0, freeTouring = false, visible = true, idleTimer = 0;
// Assembly: every part flies in from outside and settles into the complete product.
const ASM = [
  { sel: '[data-asm="srv"]', off: [0, 0, 70], d: 0, len: 0.9, spread: 1.3 },
  { sel: '[data-asm="riser"]', off: [0, 0, 60], d: 1.1, len: 0.8 },
  { sel: '[data-asm="card"]', off: [0, 90, 0], d: 1.6, len: 1.0 },
  { sel: '[data-asm="int"]', off: [0, 0, 60], d: 2.4, len: 0.8, spread: 1.2 },
  { sel: '[data-asm="bracket"]', off: [70, 0, 0], d: 2.9, len: 0.9 },
  { sel: '[data-asm="intfiber"]', fade: true, d: 3.9, len: 0.6 },
  { sel: '[data-asm="stand"]', off: [70, 0, 0], d: 4.1, len: 0.9 },
  { sel: '[data-asm="head"]', off: [0, 0, 60], d: 4.4, len: 0.9 },
  { sel: '[data-asm="cable"]', fade: true, d: 4.9, len: 0.6 },
];
const ASM_END = 5.6, ASM_OUT = 2.4;
ASM.forEach((entry) => { entry.els = entry.sel ? [...svg.querySelectorAll(entry.sel)] : []; });
let asm = null;
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
function assemble(mode) { asm = { start: performance.now(), mode: mode || "in" }; openTarget = 0; Object.assign(view, FULL); run(); }
function asmShare(entry, i, count) {
  // 1 = fully away, 0 = in place
  if (!asm) return 0;
  let t = (performance.now() - asm.start) / 1000;
  if (asm.mode === "outin") {
    if (t < ASM_OUT) { const p = t / ASM_OUT; return p * p * (3 - 2 * p); }
    t -= ASM_OUT;
  }
  const lag = entry.spread && count > 1 ? (entry.spread * i) / (count - 1) : 0;
  return 1 - easeOut(clamp((t - entry.d - lag) / entry.len, 0, 1));
}
function applyAssembly() {
  let coverOff = [0, 0, 0];
  for (const entry of ASM) {
    entry.els.forEach((el, i) => {
      const k = asmShare(entry, i, entry.els.length);
      if (entry.fade) el.style.opacity = asm ? String(1 - k) : "";
      else el.setAttribute("transform", asm && k > 0 ? translateAlong(P, entry.off.map((v) => v * k)) : "");
    });
  }
  if (asm && (performance.now() - asm.start) / 1000 > ASM_END + (asm.mode === "outin" ? ASM_OUT : 0) + 0.2) { asm = null; applyAssembly(); }
  return coverOff;
}
let stop = 0, playing = !still.matches, guideClock = 0, sweepClock = 0, focused = true, eitPath = null, eitGap = null;
// The camera: the viewBox eases toward the spotlit part, so the tour points by moving in on it.
// Video pages frame the product tightly, so it fills the card.
const FULL = { x: 0, y: 0, w: ${WIDTH}, h: ${HEIGHT} };
if (window.__STEP) {
  // frame the card, its bracket and the sensor; the server around them is context
  const sel = '[data-asm="card"],[data-asm="bracket"],[data-asm="stand"],[data-asm="head"]' + (window.__TALL ? "" : ',[data-tour="gpus"]');
  const boxes = [...svg.querySelectorAll(sel)].map((el) => el.getBBox());
  const x0 = Math.min(...boxes.map((r) => r.x)), y0 = Math.min(...boxes.map((r) => r.y));
  const b = { x: x0, y: y0, width: Math.max(...boxes.map((r) => r.x + r.width)) - x0, height: Math.max(...boxes.map((r) => r.y + r.height)) - y0 };
  const aspect = window.__TALL ? 688 / 640 : ${WIDTH} / ${HEIGHT};
  const pad = window.__TALL ? 1.08 : 1.16;
  const w = Math.max(b.width * pad, b.height * pad * aspect);
  Object.assign(FULL, { x: b.x + b.width / 2 - w / 2, y: b.y + b.height / 2 - w / aspect / 2, w, h: w / aspect });
}
const view = { ...FULL };
function viewTarget() {
  if (!focused || !spot.firstChild) return FULL;
  let box;
  try { box = spot.getBBox(); } catch (error) { return FULL; }
  if (!box.width) return FULL;
  const aspect = FULL.w / FULL.h;
  let w = Math.max(box.width * 1.9, box.height * 1.9 * aspect, FULL.w / 3);
  w = Math.min(w, FULL.w);
  const h = w / aspect;
  const x = clamp(box.x + box.width / 2 - w / 2, FULL.x - 10, FULL.x + FULL.w - w + 10);
  const y = clamp(box.y + box.height / 2 - h / 2 - h * 0.04, FULL.y - 10, FULL.y + FULL.h - h + 10);
  return { x, y, w, h };
}
function moveCamera(dt, calm) {
  const target = viewTarget();
  const k = calm ? 1 : 1 - Math.exp(-dt / 0.55);
  let moving = false;
  for (const key of ["x", "y", "w", "h"]) {
    view[key] += (target[key] - view[key]) * k;
    if (Math.abs(target[key] - view[key]) < 0.05) view[key] = target[key];
    else moving = true;
  }
  svg.setAttribute("viewBox", view.x.toFixed(2) + " " + view.y.toFixed(2) + " " + view.w.toFixed(2) + " " + view.h.toFixed(2));
  return moving;
}

function focusStop(index) {
  stop = (index + STOPS.length) % STOPS.length;
  const item = STOPS[stop];
  focused = true;
  freeTouring = false;
  guideClock = 0;
  sweepClock = 0;
  if (item.show.length) stage.dataset.focus = item.id;
  else delete stage.dataset.focus;
  guide.root.classList.remove("rx-hero");
  spot.innerHTML = item.show.flatMap((part) => [...svg.querySelectorAll('[data-tour="' + part + '"]')].map((el) => '<use href="#' + el.id + '"/>')).join("");
  guide.step.textContent = String(stop + 1).padStart(2, "0") + " / " + STOPS.length;
  guide.title.textContent = item.title;
  guide.text.textContent = item.text;
  guide.diagram.innerHTML = ({ ladder: LADDER, eit: EIT, loop: LOOP, cpt: CPT, sync: SYNC, hold: HOLD })[item.diagram] || "";
  guide.diagram.hidden = !item.diagram;
  eitPath = guide.diagram.querySelector("#rx-eit-path");
  eitGap = guide.diagram.querySelector("#rx-eit-gap");
  guide.chips.forEach((chip, i) => chip.setAttribute("aria-current", i === stop ? "step" : "false"));
  openTarget = item.open ? 1 : 0;
  if (!item.sweep) fieldTarget = item.field;
  if (atoms) atoms.style.opacity = "";
  draw();
  run();
}
function showAll() {
  focused = false;
  playing = false;
  delete stage.dataset.focus;
  spot.innerHTML = "";
  guide.chips.forEach((chip) => chip.setAttribute("aria-current", "false"));
  guide.step.textContent = "All parts";
  guide.title.textContent = "The whole server";
  guide.text.textContent = "Pick any part from the list, or press Play to walk through them in order.";
  guide.diagram.innerHTML = "";
  guide.diagram.hidden = true;
  eitPath = eitGap = null;
  freeTouring = !still.matches;
  clock = 0;
  if (atoms) atoms.style.opacity = "";
  draw();
  run();
}
function overview(end) {
  showAll();
  openTarget = 0;
  freeTouring = false;
  fieldTarget = 1.2;
  guide.root.classList.add("rx-hero");
  guide.step.textContent = OVERVIEW.step;
  guide.title.textContent = OVERVIEW.title;
  guide.text.textContent = end ? OVERVIEW.end : OVERVIEW.text;
  if (end && OVERVIEW.launch) { const note = document.createElement("small"); note.className = "rx-launch"; note.textContent = OVERVIEW.launch; guide.text.append(note); }
  draw();
  run();
}
function draw() {
  const clockMode = focused && STOPS[stop].lcd === "clock";
  const split = splitOf(field);
  beam.style.opacity = String(0.55 + 0.45 * Math.min(1, field / 3));
  applyAssembly();
  const resolved = split > MODEL.width;
  const text = clockMode ? "Rb locked · 10 MHz · 1 PPS" : "E " + field.toFixed(2) + " V/m · Δ " + split.toFixed(1) + " MHz" + (resolved ? "" : " (merged)");
  if (readout.textContent !== text) readout.textContent = text;
  if (slider && document.activeElement !== slider) slider.value = field.toFixed(2);
  if (sliderOut) sliderOut.textContent = field.toFixed(2) + " V/m";
  if (toggle) { toggle.textContent = openTarget ? "Close the case" : "Open the case"; toggle.setAttribute("aria-pressed", openTarget ? "true" : "false"); }
  if (eitPath) {
    const plot = eitPlotOf(field);
    eitPath.setAttribute("d", plot.d);
    eitGap.firstElementChild.setAttribute("d", plot.gap);
    const label = eitGap.lastElementChild;
    label.setAttribute("y", plot.labelY.toFixed(1));
    label.setAttribute("x", String(plot.labelX));
    if (label.textContent !== plot.label) label.textContent = plot.label;
  }
  guide.play.textContent = playing ? "Pause tour" : "Play tour";
  guide.play.setAttribute("aria-pressed", playing ? "true" : "false");
  guide.progress.style.transform = "scaleX(" + (playing && focused ? Math.min(1, guideClock / STEP_TIME) : 0).toFixed(3) + ")";
  stage.setAttribute("aria-valuenow", field.toFixed(2));
  stage.setAttribute("aria-valuetext", text);
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (focused && playing) {
    guideClock += dt;
    if (guideClock >= STEP_TIME) { if (window.__STEP && stop === STOPS.length - 1) overview(true); else focusStop(stop + 1); }
  }
  if (focused) {
    const item = STOPS[stop];
    sweepClock += dt;
    if (item.sweep) fieldTarget = 0.1 + 3.4 * (0.5 - 0.5 * Math.cos((2 * Math.PI * sweepClock) / (STEP_TIME * 0.62)));
    if (item.id === "atoms" && atoms) atoms.style.opacity = calm ? "1" : (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now / 260))).toFixed(2);
  } else if (freeTouring) {
    clock += dt;
    fieldTarget = FREE[Math.floor(clock / 2.6) % FREE.length];
  }
  field = calm ? fieldTarget : field + (fieldTarget - field) * (1 - Math.exp(-dt / 0.45));
  if (Math.abs(fieldTarget - field) < 0.002) field = fieldTarget;
  const want = openTarget;
  if (calm) { lift.at = want; lift.rate = 0; }
  else for (let i = 0; i < 4; i++) { lift.rate += ((want - lift.at) * 26 - lift.rate * 10) * dt / 4; lift.at += lift.rate * dt / 4; }
  if (Math.abs(want - lift.at) < 0.0005 && Math.abs(lift.rate) < 0.001) { lift.at = want; lift.rate = 0; }
  draw();
  const panning = moveCamera(dt, calm);
  const animating = Boolean(asm) || panning || (focused && playing) || freeTouring || (focused && (STOPS[stop].id === "atoms" || STOPS[stop].sweep || STOPS[stop].lcd) && !calm);
  const settled = !animating && field === fieldTarget && lift.rate === 0 && lift.at === want;
  // frame is a flag, not the rAF id: an id of 0 would let run() start a second loop
  frame = visible && !settled ? (requestAnimationFrame(tick), 1) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = 1; requestAnimationFrame(tick); } };
const pause = () => { playing = false; draw(); run(); };
const steer = (value) => {
  fieldTarget = clamp(value, 0, MODEL.maxField);
  if (focused && STOPS[stop].sweep) STOPS[stop] = { ...STOPS[stop], sweep: false, field: fieldTarget };
  playing = false;
  freeTouring = false;
  clearTimeout(idleTimer);
  if (!focused) idleTimer = setTimeout(() => { freeTouring = !still.matches; clock = 0; run(); }, 5000);
  run();
};
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "mouse" || (focused && playing)) return;
  const box = svg.getBoundingClientRect();
  steer(clamp(((event.clientX - box.left) / box.width - 0.15) / 0.7, 0, 1) * MODEL.maxField);
});
const flip = () => {};
slider.addEventListener("input", () => steer(parseFloat(slider.value)));
guide.prev.addEventListener("click", () => { focusStop(focused ? stop - 1 : STOPS.length - 1); pause(); });
guide.next.addEventListener("click", () => { focusStop(focused ? stop + 1 : 0); pause(); });
guide.play.addEventListener("click", () => {
  if (playing) { pause(); return; }
  playing = true;
  if (focused) { guideClock = 0; draw(); run(); } else focusStop(0);
});
guide.all.addEventListener("click", showAll);
guide.chips.forEach((chip, i) => chip.addEventListener("click", () => { focusStop(i); pause(); }));
stage.addEventListener("keydown", (event) => {
  let to = null;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") to = fieldTarget + 0.2;
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") to = fieldTarget - 0.2;
  if (event.key === "Home") to = 0;
  if (event.key === "End") to = MODEL.maxField;
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); flip(); return; }
  if (to === null) return;
  event.preventDefault();
  steer(to);
});
focusStop(0);
window.__tour = { focusStop, showAll, overview, assemble, play() { playing = true; focusStop(0); }, stops: STOPS.length };
`;

const css = `<style>
.rx-well{fill:var(--anatomy-shade-1)}
.rx-bezel{fill:var(--anatomy-top)}
.iso .rx-glass{fill:#0d1013}
.rx-grid{fill:none;stroke:#2a3138;stroke-width:.4px;vector-effect:non-scaling-stroke}
.rx-trace{fill:none;stroke:#9fd3ff;stroke-width:.9px;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.rx-text{fill:#c9d4dd;font-family:var(--anatomy-mono);letter-spacing:.02em}
.rx-lock{fill:#5be08a}
.rx-beam{fill:none;stroke:var(--rx-beam);stroke-width:1.1px;stroke-linecap:round;vector-effect:non-scaling-stroke}
.iso{--rx-beam:#8a5cff;--rx-jacket:#d9b93a;--rx-jacket-shade:#a88a1c}
.iso[data-theme="dark"]{--rx-beam:#b79cff;--rx-jacket:#c9ad3c;--rx-jacket-shade:#7f6a1d}
.rx-jacket .tb-body{fill:var(--rx-jacket)}
.rx-jacket .tb-shade{fill:var(--rx-jacket-shade)}
.rx-fiber .tb-body{fill:var(--rx-jacket)}
.rx-boot .iso-top,.rx-boot .iso-fill{fill:var(--rx-jacket)}
.rx-controls{display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;padding:14px 4px 2px;font:12px/1.4 var(--anatomy-mono);color:var(--anatomy-text)}
.rx-field{display:flex;align-items:center;gap:10px;flex:1 1 260px;min-width:0}
.rx-field span{letter-spacing:.08em;text-transform:uppercase;color:var(--anatomy-muted)}
.rx-field input{flex:1;min-width:0;accent-color:var(--rx-beam)}
.rx-field output{min-width:7ch;text-align:right;color:var(--anatomy-strong);font-variant-numeric:tabular-nums}
#rx-open{font:inherit;letter-spacing:.06em;text-transform:uppercase;color:var(--anatomy-strong);background:var(--anatomy-face);border:1px solid var(--anatomy-mid);border-radius:6px;padding:8px 14px;cursor:pointer}
#rx-open:hover{border-color:var(--anatomy-hi)}
#rx-open:focus-visible,.rx-field input:focus-visible,.iso-stage:focus-visible{outline:2px solid var(--rx-beam);outline-offset:2px}
#rx-open[aria-pressed="true"]{background:var(--anatomy-top);border-color:var(--anatomy-hi)}
.iso-stage{touch-action:pan-y;cursor:pointer;overflow:hidden;border-radius:4px}
.iso-stage > svg{overflow:hidden}
.iso{--rx-glow:#7c4dff;--rx-probe:#c2412d;--rx-coupling:#1f9d55;--rx-rf:#7c4dff}
.iso[data-theme="dark"]{--rx-glow:#b79cff;--rx-probe:#ff7a5c;--rx-coupling:#5ad38a;--rx-rf:#b79cff}
.rx-veil{fill:var(--anatomy-card);opacity:0;transition:opacity .45s var(--anatomy-ease);pointer-events:none}
.iso-stage[data-focus] .rx-veil{opacity:.74}
.rx-spot{pointer-events:none;animation:rx-pulse 1.8s ease-in-out infinite}
@keyframes rx-pulse{0%,100%{filter:drop-shadow(0 0 1px var(--rx-glow))}50%{filter:drop-shadow(0 0 4px var(--rx-glow)) drop-shadow(0 0 1.5px var(--rx-glow))}}
@media (prefers-reduced-motion: reduce){.rx-spot{animation:none;filter:drop-shadow(0 0 2.5px var(--rx-glow))}}
.rx-guide{display:grid;gap:14px;margin-top:14px;padding:16px 4px 4px;border-top:1px solid var(--anatomy-faint)}
.rx-guide-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
#rx-step{font:12px/1 var(--anatomy-mono);letter-spacing:.08em;color:var(--rx-glow);font-variant-numeric:tabular-nums}
#rx-title{margin:0;font-size:19px;line-height:1.25;font-weight:600;color:var(--anatomy-strong);text-wrap:balance}
.rx-guide-body{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
.rx-guide-body:has(#rx-diagram:not([hidden])){grid-template-columns:minmax(0,1.15fr) minmax(0,1fr)}
@media (max-width:560px){.rx-guide-body:has(#rx-diagram:not([hidden])){grid-template-columns:minmax(0,1fr)}}
#rx-text{margin:0;max-width:62ch;color:var(--anatomy-text);font-size:14.5px;line-height:1.65}
#rx-diagram{min-width:0}
.rx-diagram{display:block;width:100%;height:auto;border:1px solid var(--anatomy-faint);border-radius:8px;background:var(--anatomy-face)}
.rx-dg-level path,.rx-dg-axis path{stroke:var(--anatomy-mid);stroke-width:1.4;fill:none}
.rx-dg-label text{font:10px var(--anatomy-mono);fill:var(--anatomy-text)}
.rx-dg-label .rx-dg-note{fill:var(--anatomy-muted)}
.rx-dg-tag{font:10px var(--anatomy-mono)}
.rx-dg-probe{stroke:var(--rx-probe);stroke-width:2;fill:none}.rx-dg-probe-t{fill:var(--rx-probe)}
.rx-dg-coupling{stroke:var(--rx-coupling);stroke-width:2;fill:none}.rx-dg-coupling-t{fill:var(--rx-coupling)}
.rx-dg-rf{stroke:var(--rx-rf);stroke-width:1.6;fill:none}.rx-dg-rf-t{fill:var(--rx-rf)}
.rx-dg-electron{fill:var(--anatomy-strong);animation:rx-climb 3.6s cubic-bezier(.5,0,.3,1) infinite}
@keyframes rx-climb{0%,12%{transform:translateY(0)}36%,52%{transform:translateY(-44px)}76%,100%{transform:translateY(-106px)}}
@media (prefers-reduced-motion: reduce){.rx-dg-electron{animation:none;transform:translateY(-106px)}}
.rx-dg-curve{fill:none;stroke:var(--rx-glow);stroke-width:2;stroke-linejoin:round}
.rx-dg-gap path{fill:none;stroke:var(--anatomy-strong);stroke-width:1}
.rx-dg-gap text{font:10px var(--anatomy-mono);fill:var(--anatomy-strong)}
.iso[data-theme="light"]{--anatomy-hi:#0e0e10;--anatomy-mid:#2e2e33;--anatomy-lo:#5a5a60;--anatomy-faint:#8e8e95;--anatomy-dot:#1c1c1f;--anatomy-weight:.85px}
.rx-dg-out{stroke:var(--rx-coupling);stroke-width:1.6;fill:none}.rx-dg-out-t{fill:var(--rx-coupling)}
.rx-dg-center text{text-anchor:middle}
.rx-dg-box rect{fill:var(--anatomy-card);stroke:var(--anatomy-mid);stroke-width:1.2}
.rx-dg-loop{fill:none;stroke:var(--rx-glow);stroke-width:1.6;stroke-dasharray:4 4}
.rx-dg-pulse{fill:var(--rx-glow);offset-path:path("M70 40H250V130H70Z");animation:rx-loop 4s linear infinite}
@keyframes rx-loop{from{offset-distance:0%}to{offset-distance:100%}}
.rx-dg-lock{fill:none;stroke:var(--rx-coupling);stroke-width:1.4;stroke-dasharray:3 3;animation:rx-blink 1.4s ease-in-out infinite}
.rx-dg-lock-t{fill:var(--rx-coupling)}
@keyframes rx-blink{50%{opacity:.35}}
@media (prefers-reduced-motion: reduce){.rx-dg-pulse,.rx-dg-lock{animation:none}}
.rx-guide-nav{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.rx-guide-nav button,.rx-chip{font:12px/1.2 var(--anatomy-mono);letter-spacing:.04em;color:var(--anatomy-strong);background:var(--anatomy-face);border:1px solid var(--anatomy-lo);border-radius:6px;padding:8px 12px;cursor:pointer}
.rx-guide-nav button:hover,.rx-chip:hover{border-color:var(--anatomy-hi)}
.rx-guide-nav button:focus-visible,.rx-chip:focus-visible{outline:2px solid var(--rx-glow);outline-offset:2px}
#rx-play[aria-pressed="true"]{border-color:var(--rx-glow);color:var(--rx-glow)}
.rx-track{flex:1 1 80px;height:2px;background:var(--anatomy-faint);border-radius:2px;overflow:hidden;min-width:60px}
#rx-progress{display:block;height:100%;background:var(--rx-glow);transform-origin:left;transform:scaleX(0)}
.rx-chips{display:flex;flex-wrap:wrap;gap:6px;list-style:none;margin:0;padding:0}
.rx-chip{padding:6px 10px;font-size:11.5px;color:var(--anatomy-text)}
.rx-chip span{color:var(--anatomy-muted);margin-right:6px;font-variant-numeric:tabular-nums}
.rx-chip[aria-current="step"]{border-color:var(--rx-glow);color:var(--anatomy-strong);background:var(--anatomy-top)}
.rx-chip[aria-current="step"] span{color:var(--rx-glow)}
</style>`;

const controls = `<div class="rx-controls">
  <label class="rx-field" for="rx-field"><span>RF field</span>
    <input id="rx-field" type="range" min="0" max="${MODEL.maxField}" step="0.05" value="0.3">
    <output id="rx-field-out" for="rx-field">0.30 V/m</output></label>
</div>`;

const guideHtml = `<section class="rx-guide" aria-label="Guided tour of the parts">
  <div class="rx-guide-head"><span id="rx-step">01 / ${STOPS.length}</span><h2 id="rx-title">${STOPS[0].title}</h2></div>
  <div class="rx-guide-body" aria-live="polite"><p id="rx-text">${STOPS[0].text}</p><div id="rx-diagram" hidden></div></div>
  <div class="rx-guide-nav">
    <button id="rx-prev" type="button">Previous</button>
    <button id="rx-play" type="button" aria-pressed="true">Pause tour</button>
    <button id="rx-next" type="button">Next</button>
    <span class="rx-track" aria-hidden="true"><span id="rx-progress"></span></span>
    <button id="rx-all" type="button">Show all</button>
  </div>
  <ul class="rx-chips">${STOPS.map((stop, i) => `<li><button class="rx-chip" type="button" aria-current="${i ? "false" : "step"}"><span>${String(i + 1).padStart(2, "0")}</span>${stop.title.split(" · ")[0].split(":")[0]}</button></li>`).join("")}</ul>
</section>`;

const body =
  css +
  k.plateHtml({
    fig: "Fig 1",
    title: "PhyQ Mini in an AI server",
    hint: "Follow the tour below, or pick a part",
    readout: "E 0.30 V/m · Δ 2.4 MHz (merged)",
    keys: [
      { mark: "lit", label: "Rubidium vapor cell: the RF sensor. Two lasers lift its atoms to Rydberg states" },
      { mark: "raised", label: "PhyQ Mini card: lasers, photonic chip, FPGA, Rb clock cell, oscillator" },
      { mark: "flat", label: "Fiber: carries the light out to the sensor and back" },
    ],
    caption: `One PCIe card does two jobs. The Rydberg sensor reads RF fields from atomic constants: an RF field splits the EIT peak by Δ = (λc/λp)·℘E/h, ${MODEL.perVm.toFixed(2)} MHz per V/m for an assumed ℘ = ${MODEL.dipole} e·a₀. The same lasers lock a disciplined oscillator to rubidium's 6.835 GHz hyperfine resonance (CPT), giving 10 MHz and 1 PPS for the whole rack.`,
    body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="PhyQ Mini: arrow keys set the RF field" aria-valuemin="0" aria-valuemax="${MODEL.maxField}" aria-valuenow="0.3">${svg}</div>${controls}${guideHtml}`,
  });

const name = theme === "light" ? "phyq-mini-light.html" : "phyq-mini.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "PhyQ Mini", theme, body, script: kitScript() + live }));

// A fragment for a claude.ai artifact: the host supplies the document skeleton and the viewer's theme.
if (theme === "light") {
  const themeScript = `
const root = document.getElementById("rx-root");
const dark = matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => {
  const chosen = document.documentElement.getAttribute("data-theme");
  root.setAttribute("data-theme", chosen === "dark" || chosen === "light" ? chosen : dark.matches ? "dark" : "light");
};
applyTheme();
dark.addEventListener("change", applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
`;
  const frame = `<title>PhyQ Mini</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
:root{--page:#f2f2ef}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--page:#0b0b0b;color-scheme:dark}}
:root[data-theme="dark"]{--page:#0b0b0b;color-scheme:dark}
body{background:var(--page)}
${k.ISO_CSS}
*{box-sizing:border-box}
#rx-root{min-height:100%;background:var(--anatomy-page);color:var(--anatomy-text);font:14px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;padding-block:40px 64px;padding-left:max(16px, env(safe-area-inset-left, 0px));padding-right:max(16px, env(safe-area-inset-right, 0px))}
#rx-root .iso-page{width:min(720px,100%);margin:0 auto}
</style>
<main id="rx-root" class="iso" data-theme="light"><div class="iso-page">${body}</div></main>
<script type="module">${(themeScript + kitScript() + live).replace(/<\/(script)/gi, "<\\/$1")}</script>
`;
  writeFileSync(join(HERE, "artifact.html"), frame);
  writeFileSync(join(HERE, "artifact-full.html"), `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${frame}</html>`);

  // Video pages, light theme: "wide" is 16:9 (drawing left, words right), "tall" is 9:16 for phones (drawing above, words below).
  const videoCss = (tall) => `<style>
html,body{margin:0;width:${tall ? 720 : 1280}px;height:${tall ? 1280 : 720}px;overflow:hidden;background:var(--anatomy-page)}
.vid{position:relative;width:${tall ? 720 : 1280}px;height:${tall ? 1280 : 720}px;display:grid;${tall ? "grid-template-rows:auto 1fr" : "grid-template-columns:880px 1fr"};font:${tall ? 26 : 19}px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--anatomy-strong);-webkit-font-smoothing:antialiased}
.vid-stage{display:flex;align-items:center;justify-content:center;padding:${tall ? "28px 16px 8px" : "20px 0 20px 20px"}}
.vid-stage .iso-stage{width:100%;border-radius:14px;background:var(--anatomy-card);box-shadow:0 1px 2px #0000000d,0 8px 24px -12px #0000001f}
.vid-stage svg{display:block;width:100%;height:${tall ? "640px" : "auto"}}
.vid-panel{display:flex;flex-direction:column;gap:${tall ? 24 : 14}px;padding:${tall ? "30px 40px 64px" : "40px 36px 32px 32px"};min-width:0}
.vid-brand{display:flex;align-items:baseline;gap:12px}
.vid-brand b{font-size:${tall ? 40 : 26}px;letter-spacing:-.01em;font-weight:700;color:var(--anatomy-strong)}
.vid-brand span{font:${tall ? 15 : 12}px var(--anatomy-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--anatomy-muted)}
.vid .rx-guide{border-top:0;margin:0;padding:0;gap:${tall ? 16 : 12}px}
.vid .rx-guide-nav,.vid .rx-chips{display:none}
.vid .rx-guide-body,.vid .rx-guide-body:has(#rx-diagram:not([hidden])){grid-template-columns:minmax(0,1fr)}
.vid #rx-step{font-size:${tall ? 22 : 14}px;color:var(--anatomy-muted)}
.vid #rx-title{font-size:${tall ? 44 : 28}px;letter-spacing:-.01em}
.vid #rx-text{font-size:${tall ? 26 : 19}px;line-height:1.5;color:var(--anatomy-strong);max-width:none}
.vid .rx-diagram{max-height:${tall ? 262 : 210}px;background:var(--anatomy-card)}
.vid .rx-dg-label text,.vid .rx-dg-tag{font-size:11px}
.vid .rx-hero .rx-guide-head{flex-direction:column;align-items:flex-start;gap:10px}
.vid .rx-hero #rx-title{font-size:${tall ? 120 : 68}px;line-height:1}
.vid .rx-hero #rx-text{font-size:${tall ? 36 : 22}px}
.vid .rx-hero #rx-step{font-size:${tall ? 18 : 12}px;letter-spacing:.08em;white-space:nowrap;text-transform:uppercase}
.vid-read{margin-top:auto;font:${tall ? 22 : 14}px var(--anatomy-mono);color:var(--anatomy-muted);font-variant-numeric:tabular-nums}
.vid-hidden{position:absolute;left:-9999px;top:0}
.rx-wg{fill:none;stroke:var(--rx-glow);stroke-width:.6px;vector-effect:non-scaling-stroke;opacity:.8}
.rx-launch{display:block;margin-top:${tall ? 22 : 16}px;font:${tall ? 17 : 13}px var(--anatomy-mono);letter-spacing:.14em;text-transform:uppercase;color:var(--anatomy-muted)}
.vid-panel:has(.rx-hero) .vid-brand{display:none}
${tall ? ".vid-brand,.vid-read{display:none}" : ""}
</style>`;
  const videoOf = (tall) =>
    k.pageHtml({
      title: "PhyQ Mini video",
      theme: "light",
      width: 1280,
      body: `${css}${videoCss(tall)}<div class="vid">
<div class="vid-stage"><div class="iso-stage" tabindex="0">${svg}</div></div>
<aside class="vid-panel"><div class="vid-brand"><b>PhyQ Mini</b><span>Rb · PCIe · AI servers</span></div>${guideHtml}<div class="vid-read"><span data-readout></span></div></aside>
<div class="vid-hidden">${controls}</div>
</div>`,
      script: "window.__STEP = 12;" + (tall ? "window.__TALL = true;" : "") + kitScript() + live,
    }).replace(".iso-page{width:min(1280px,100% - 32px);margin:64px auto 96px}", ".iso-page{margin:0}");
  writeFileSync(join(HERE, "video.html"), videoOf(false));
  writeFileSync(join(HERE, "video-tall.html"), videoOf(true));
  console.log("wrote video.html, video-tall.html");
  console.log("wrote artifact.html");
}
console.log("wrote", name);
