// PhyQ Mini inside an AI server: the drawing. Exports the SVG body and the projection.
import * as k from "../../.claude/skills/anatomy/kit/iso-kit.mjs";
import * as G from "../../.claude/skills/anatomy/kit/lathe.mjs";
import { tubePieces, tubeSvg } from "../../.claude/skills/anatomy/kit/tube.mjs";

export const WIDTH = 640;
export const HEIGHT = 440;

// Bench plate under the server and the sensor stand.
const PLATE = { x: -164, y: -96, w: 392, d: 216, r: 9 };
const PLATE_H = 7;

// Server chassis section (open top): floor, tall back and left walls, low lips at front and rear.
const CH = { x: -148, y: -80, w: 302, d: 184, r: 2 };
const CH_RIGHT = CH.x + CH.w; // 154: the server's rear, where the card bracket sits
const CH_FRONT = CH.y + CH.d; // 104
const FLOOR = 3;
const WALL_H = 34;
const LIP_H = 8;
const MB = { x: -140, y: -72, w: 286, d: 168, r: 2 };
const MBT = FLOOR + 1.6; // motherboard top

// The PhyQ Mini card, mounted flat on a riser.
const CARD = { x: -38, y: 12, w: 186, d: 84, r: 2 };
const CZ = 38; // card bottom
const CT = CZ + 1.6; // card top
const BRX = CARD.x + CARD.w; // bracket inner face, x = 148
const BR_T = 1.6;
const PORT_Z = 41;
const PORTS = { fiber: 30, ten: 48, pps: 62, gnss: 76, led: 89 };

// Sensor head on a small stand outside the server.
const STAND = [190, 30];
const BASE_R = 11;
const BASE_H = 4;
const ZH = 62;
const CAP_R = 6.5;
const CELL_R = 3.8;
const ROD_R = 0.75;
const ROD_AT = 5;
const CELL_S = 8;
const ROD_S = 9.6;
const CAP_S = 13;

export const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H, 0), ...k.boxCorners(CH, 0, WALL_H + 22), [STAND[0] + CAP_S + 2, STAND[1], ZH + CAP_R + 2], [STAND[0] - CAP_S - 2, STAND[1], ZH + CAP_R + 2]],
  WIDTH,
  HEIGHT,
  { pad: 24, azimuth: 60, elevation: 36 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const V = G.viewOf(P);
const depth = (p) => G.dot3(p, V);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const alongX = (x, y, z) => G.frameOf([x, y, z], [1, 0, 0], [0, -1, 0], [0, 0, 1]);
const box = (plan, z, h, tone = "mid", extra = "") => S(k.slabOf(plan, z, h, P, 3, 0.4), { tone }) + extra;

let tours = 0;
const T = (part, svg) => `<g data-tour="${part}" id="rx-t${tours++}">${svg}</g>`;

// A depth-sorted layer: items are drawn far to near.
function layer() {
  const items = [];
  return {
    put(centre, svg) { items.push({ key: depth(centre), svg }); },
    svg() { return items.sort((a, b) => a.key - b.key).map((item) => item.svg).join(""); },
  };
}

// ---------- bench and chassis ----------
function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H, PLATE_H, P)}"/>`];
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.4), { tone: "mid", inner: L(k.sideSeam(PLATE, -PLATE_H + 2.5, P, 8), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2, 0, P, 16)).join(""), { tone: "lo" }));
  return out.join("");
}

function chassis() {
  const out = [`<path class="iso-halo" d="${k.haloOf(CH, 0, 8, P)}"/>`];
  out.push(S(k.slabOf(CH, 0, FLOOR, P, 3, 0.4), { tone: "lo" }));
  // back and left walls with vent slots
  const back = { x: CH.x, y: CH.y, w: CH.w, d: 3, r: 0.8 };
  const left = { x: CH.x, y: CH.y + 3, w: 3, d: CH.d - 3, r: 0.6 };
  out.push(S(k.slabOf(back, FLOOR, WALL_H, P, 2, 0.3), { tone: "mid" }));
  out.push(S(k.slabOf(left, FLOOR, WALL_H, P, 2, 0.3), { tone: "mid" }));
  // motherboard with mounting screws and a grid of vias
  out.push(S(k.slabOf(MB, FLOOR, MBT - FLOOR, P, 3), { tone: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(MB, 3), MBT, P, 3), { tone: "faint" }));
  out.push(D(k.corners(MB, 6).map(([x, y]) => at([x, y, MBT])), { size: 0.45 }));
  return out.join("");
}

function lips() {
  const right = { x: CH_RIGHT - 3, y: CH.y + 3, w: 3, d: CH.d - 3, r: 0.6 };
  const front = { x: CH.x + 3, y: CH_FRONT - 3, w: CH.w - 6, d: 3, r: 0.6 };
  return S(k.slabOf(front, FLOOR, LIP_H, P, 2, 0.3), { tone: "mid" }) + S(k.slabOf(right, FLOOR, LIP_H, P, 2, 0.3), { tone: "mid" });
}

// ---------- the AI server around the card: fans, GPUs, memory, CPU ----------
function server() {
  const lay = layer();
  let n = 0;
  const put = (centre, svg, part) => lay.put(centre, `<g data-asm="srv" data-i="${n++}">${part ? T(part, svg) : svg}</g>`);
  // fan wall along the left side
  for (let i = 0; i < 4; i++) {
    const y = -72 + i * 41;
    const fan = { x: -142, y, w: 16, d: 35, r: 2 };
    const F = alongX(-126, y + 17.5, MBT + 17.5);
    const face = L(G.circleOf(F, 0, 14.5, P, 48) + G.circleOf(F, 0, 10, P, 40) + G.circleOf(F, 0, 5.5, P, 28), { tone: "lo" }) + S(G.disc(0, 0.8, 3.4, F, P), { tone: "mid" });
    put([-134, y + 17, MBT + 17], box(fan, MBT, 35, "mid", face));
  }
  // two GPU modules: base, fin stack along the airflow, power plug
  for (const y of [-72, -38]) {
    const g = { x: -112, y, w: 118, d: 32, r: 2 };
    let fins = "";
    for (let i = 0; i < 8; i++) fins += S(k.slabOf({ x: g.x + 4, y: g.y + 2.2 + i * 3.8, w: g.w - 26, d: 1.1, r: 0.3 }, MBT + 6, 20, P, 2), { tone: "mid", crease: "lo" });
    const plug = box({ x: g.x + g.w - 18, y: g.y + 12, w: 12, d: 18, r: 1 }, MBT + 6, 9, "mid");
    put([g.x + g.w / 2, y + 21, MBT + 14], T("gpus", box(g, MBT, 6, "mid") + fins + plug));
  }
  // memory: eight DIMMs standing in their slots
  for (let i = 0; i < 8; i++) {
    const y = -72 + i * 5.6;
    put([46, y + 1, MBT + 12], box({ x: 16, y, w: 60, d: 1.8, r: 0.3 }, MBT, 3, "lo") + box({ x: 18, y: y + 0.2, w: 56, d: 1.4, r: 0.2 }, MBT + 3, 22, "hi"));
  }
  // CPU heat sink
  const cpu = { x: 90, y: -72, w: 44, d: 44, r: 2 };
  let cf = "";
  for (let i = 0; i < 9; i++) cf += S(k.slabOf({ x: cpu.x + 2, y: cpu.y + 2.4 + i * 4.8, w: cpu.w - 4, d: 1, r: 0.3 }, MBT + 5, 22, P, 2), { tone: "mid", crease: "lo" });
  put([112, -50, MBT + 14], box(cpu, MBT, 5, "mid") + cf);
  return lay.svg();
}

// ---------- the riser and the PCIe slot ----------
function riser() {
  const board = { x: -24, y: 3, w: 112, d: 2, r: 0.3 };
  const slot = { x: -20, y: 5, w: 104, d: 9, r: 1 };
  const pins = [];
  for (let x = -14; x < 80; x += 3.4) pins.push(at([x, 5.2, 41.6]));
  return {
    back: `<g data-asm="riser">${box(board, MBT, 44, "lo") + box({ x: -26, y: 1, w: 116, d: 6, r: 1 }, MBT, 4, "mid")}</g>`,
    slot: `<g data-asm="riser">${T("pcie", box(slot, CZ - 4, 9, "mid", L(k.lineOnTop([slot.x + 3, slot.y + 4.5], [slot.x + slot.w - 3, slot.y + 4.5], CZ + 5, P), { tone: "lo" })))}</g>`,
  };
}

// ---------- the card ----------
function card() {
  const pcb = S(k.slabOf(CARD, CZ, CT - CZ, P, 3), { tone: "lo" }) + L(k.planOutline(k.insetPlan(CARD, 3), CT, P, 3), { tone: "faint" });
  // gold fingers show beside the slot as a row of short pads
  const pads = [];
  for (let x = -16; x < 82; x += 3.4) pads.push(k.lineOnTop([x, 12.6], [x, 15.6], CT, P));
  return `<g data-asm="card">${T("pcie", L(pads.join(""), { tone: "mid", free: true }))}${pcb}${D(k.corners(CARD, 4).map(([x, y]) => at([x, y, CT])), { size: 0.4 })}</g>`;
}

function parts() {
  const lay = layer();
  let n = 0;
  const put = (centre, svg, part, group = "int") => lay.put(centre, `<g data-asm="${group}" data-i="${n++}">${T(part, svg)}</g>`);

  // power: inductors, capacitors, regulators near the slot end
  for (const [x, y] of [[-32, 24], [-32, 38], [-32, 52]]) put([x + 4, y + 4, CT + 3], box({ x, y, w: 9, d: 9, r: 1.2 }, CT, 5, "mid", L(k.ring(x + 4.5, y + 4.5, 2.4, CT + 5, P, 14), { tone: "faint" })), "power");
  for (const [x, y] of [[-17, 68], [-17, 76], [-17, 84], [-30, 72], [-30, 82]]) put([x, y, CT + 3], S(k.cylinder(x, y, 2.6, CT, 7, P, 18), { tone: "mid" }) + L(k.ring(x, y, 1.6, CT + 7, P, 12), { tone: "faint" }), "power");
  for (const [x, y] of [[-18, 26], [-18, 40]]) put([x + 3, y + 3, CT + 1], box({ x, y, w: 7, d: 7, r: 0.6 }, CT, 1.4, "mid", D([0, 1, 2].map((i) => at([x + 1.5 + i * 2, y + 7, CT])), { size: 0.3 })), "power");

  // lasers: two chip-scale packages, 780 nm and 480 nm, with pins along both sides
  const laser = (y, finned) => {
    const p = { x: -4, y, w: 26, d: 11, r: 1.6 };
    let extra = L(k.planOutline(k.insetPlan(p, 2), CT + 6, P, 3), { tone: "faint" });
    extra += D([0, 1, 2, 3, 4].map((i) => at([p.x + 4 + i * 4.4, p.y + p.d + 0.8, CT])), { size: 0.35 });
    if (finned) for (let i = 0; i < 4; i++) extra += S(k.slabOf({ x: p.x + 5 + i * 4.6, y: p.y + 2.5, w: 1.2, d: p.d - 5, r: 0.3 }, CT + 6, 2.4, P, 2), { tone: "mid" });
    return box(p, CT, 6, "hi", extra);
  };
  put([9, 61, CT + 4], laser(56, false), "lasers");
  put([9, 77, CT + 4], laser(72, true), "lasers");
  // fiber stubs from each laser into the photonic chip
  for (const y of [61.5, 77.5]) put([28, y, CT + 3], S(G.disc(0, 8, 1.1, alongX(22, y, CT + 3), P), { tone: "mid" }), "lasers");

  // photonic chip on its carrier, waveguides drawn on top, two photodiodes at its edge
  const carrier = { x: 30, y: 54, w: 40, d: 36, r: 1.5 };
  const chip = { x: 33, y: 57, w: 34, d: 30, r: 1 };
  const wg = [
    [[33, 61.5], [42, 61.5], [48, 66], [60, 66], [67, 66]],
    [[33, 77.5], [42, 77.5], [48, 73], [60, 73], [67, 78]],
    [[48, 66], [56, 60], [67, 60]],
  ].map((path) => k.pathOf(path.map(([x, y]) => at([x, y, CT + 4.2])))).join("");
  const pd = [[61, 82], [61, 58]].map(([x, y]) => box({ x, y, w: 4, d: 4, r: 0.5 }, CT + 4.2, 0.8, "hi")).join("");
  put([50, 72, CT + 2], box(carrier, CT, 2.4, "mid") + box(chip, CT + 2.4, 1.8, "hi", `<path class="rx-wg" d="${wg}"/>` + pd), "photonics");

  // FPGA with a low heat sink, plus ADC, DAC and memory around it
  const fpga = { x: 36, y: 20, w: 28, d: 28, r: 1 };
  let sink = "";
  for (let i = 0; i < 7; i++) sink += S(k.slabOf({ x: fpga.x + 2 + i * 3.6, y: fpga.y + 2, w: 1.2, d: fpga.d - 4, r: 0.3 }, CT + 2.6, 4, P, 2), { tone: "mid" });
  put([50, 34, CT + 4], box(fpga, CT, 2.6, "mid", sink), "fpga");
  for (const [x, y, w, d] of [[70, 22, 12, 9], [70, 36, 12, 9], [12, 24, 16, 9]]) put([x + w / 2, y + d / 2, CT + 1], box({ x, y, w, d, r: 0.6 }, CT, 1.4, "mid", D(Array.from({ length: 4 }, (_, i) => at([x + 2 + i * ((w - 4) / 3), y + d, CT])), { size: 0.3 })), "fpga");

  // rubidium clock physics package: a magnetic-shield can with a heater ring
  const cx = 94, cy = 74;
  put([cx, cy, CT + 7], S(k.cylinder(cx, cy, 11, CT, 1.6, P, 40), { tone: "mid" }) + S(k.cylinder(cx, cy, 9.5, CT + 1.6, 12, P, 40), { tone: "hi", inner: L(k.sideArc(cx, cy, 9.5, CT + 7, P, 32), { tone: "faint" }) }) + L(k.ring(cx, cy, 6.5, CT + 13.6, P, 32) + k.ring(cx, cy, 3, CT + 13.6, P, 20), { tone: "lo" }), "clockcell");

  // disciplined oscillator
  const osc = { x: 112, y: 62, w: 20, d: 20, r: 2 };
  put([122, 72, CT + 5], box(osc, CT, 9, "mid", L(k.planOutline(k.insetPlan(osc, 3), CT + 9, P, 3), { tone: "faint" }) + D(k.corners(osc, 2.2).map(([x, y]) => at([x, y, CT + 9])), { size: 0.4 })), "oscillator");

  // on-card fibers: chip → clock cell, chip → bracket port
  const fiber = (points, part = "fiber") => {
    const route = G.fillet(points, 5, 7, { P, tube: 0.7 });
    for (const piece of tubePieces(route, 0.7, P, { maxLength: 9 })) lay.put(piece.mid, `<g data-asm="intfiber">${T(part, `<g class="rx-fiber">${tubeSvg(piece, { tone: "lo" })}</g>`)}</g>`);
  };
  fiber([[67, 78, CT + 3], [78, 78, CT + 3], [84, 75, CT + 3]], "clockcell");
  fiber([[67, 60, CT + 3], [96, 56, CT + 3], [118, 46, CT + 3], [136, PORTS.fiber, CT + 3], [BRX - 1, PORTS.fiber, PORT_Z]]);
  return lay.svg();
}

// ---------- rear bracket with its ports, facing out of the server (+x) ----------
function bracket() {
  const plate_ = { x: BRX, y: CARD.y - 2, w: BR_T, d: CARD.d + 4, r: 0.4 };
  const out = [S(k.slabOf(plate_, 12, 44, P, 2, 0.2), { tone: "mid" })];
  out.push(S(k.slabOf({ x: BRX - 8, y: CARD.y - 2, w: 8, d: 4, r: 0.4 }, 54, 2, P, 2), { tone: "mid" }));
  const face = BRX + BR_T;
  const sma = (y) => {
    const F = alongX(face, y, PORT_Z);
    const hex = Array.from({ length: 6 }, (_, i) => [3.4 * Math.cos((i * Math.PI) / 3), 3.4 * Math.sin((i * Math.PI) / 3)]);
    return S(G.prismOf(F, hex, 0, 1.4, P), { tone: "mid" }) + S(G.disc(1.4, 6, 2.4, F, P), { tone: "mid", inner: k.fadedSvg(G.ribsOf(F, 1.4, 6, 2.4, 18, P, { fade: [0.1, 0.55] }), { tone: "lo" }) }) + L(G.circleOf(F, 6, 1.2, P, 24), { tone: "lo" }) + D([at(G.pointOf(F, 6, 0, 0))], { size: 0.45, tone: "hi" });
  };
  const lc = (y) => {
    const F = alongX(face, y, PORT_Z);
    return S(G.prismOf(F, [[-3.4, -2.6], [3.4, -2.6], [3.4, 2.6], [-3.4, 2.6]], 0, 4, P), { tone: "mid" }) + S(G.disc(4, 6.5, 1.4, F, P), { tone: "hi" });
  };
  const ports = T("bracket", [sma(PORTS.ten), sma(PORTS.pps), sma(PORTS.gnss)].join("")) + T("fiber", lc(PORTS.fiber));
  const led = T("bracket", `<g data-part="led">${D([at([face, PORTS.led, PORT_Z])], { size: 1, tone: "hi" })}</g>`);
  // the bracket's screw tab and label strip
  out.push(L(k.pathOf([at([face, CARD.y + 4, 18]), at([face, CARD.y + CARD.d - 4, 18])]), { tone: "faint" }));
  return T("bracket", out.join("")) + ports + led;
}

// ---------- sensor head and stand ----------
const HEAD = G.frameOf([STAND[0], STAND[1], ZH], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const MAST_TOP = ZH - CAP_R - 2;
const PORT_N = [-0.5, Math.sqrt(3) / 2, 0];
const BASE_PORT = G.frameAlong([STAND[0] + BASE_R * PORT_N[0], STAND[1] + BASE_R * PORT_N[1], 2.2], PORT_N);

function stand() {
  const [x, y] = STAND;
  const out = [`<path class="iso-halo" d="${k.haloOf({ x: x - BASE_R, y: y - BASE_R, w: BASE_R * 2, d: BASE_R * 2, r: BASE_R }, 0, 5, P)}"/>`];
  out.push(S(k.cylinder(x, y, BASE_R, 0, BASE_H, P, 64, 0.7), { tone: "mid" }));
  out.push(L(k.ring(x, y, BASE_R - 2.6, BASE_H, P, 48), { tone: "faint" }));
  out.push(S(G.disc(-1, 2, 2.4, BASE_PORT, P), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 3, BASE_H, 3, P, 24), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 1.6, BASE_H + 3, MAST_TOP - BASE_H - 3, P, 18), { tone: "mid", crease: "none" }));
  out.push(S(k.slabOf({ x: x - 3.2, y: y - 3.2, w: 6.4, d: 6.4, r: 1.4 }, 32, 6, P, 3, 0.4), { tone: "mid" }));
  out.push(S(k.slabOf({ x: x - ROD_S, y: y - 3.5, w: ROD_S * 2, d: 7, r: 1 }, MAST_TOP, 2, P, 3, 0.3), { tone: "mid" }));
  return T("head", out.join(""));
}

function head() {
  const lay = layer();
  const put = (centre, svg, part = "head") => lay.put(centre, T(part, svg));
  const cap = (s0, s1) => S(G.disc(s0, s1, CAP_R, HEAD, P), { tone: "mid", inner: L(G.arcOf(HEAD, (s0 + s1) / 2, CAP_R, P), { tone: "faint" }) });
  put(G.pointOf(HEAD, -(ROD_S + CAP_S) / 2, 0, 0), cap(-CAP_S, -ROD_S));
  for (const angle of [Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6]) {
    const c = G.pointOf(HEAD, 0, ROD_AT, angle);
    put(c, S(G.disc(-ROD_S, ROD_S, ROD_R, G.frameAlong(c, [1, 0, 0]), P), { tone: "mid" }));
  }
  const cell =
    S(G.disc(-CELL_S - 0.6, -CELL_S, CELL_R + 0.5, HEAD, P), { tone: "hi", lit: true }) +
    S(G.disc(-CELL_S, CELL_S, CELL_R, HEAD, P), { tone: "hi", lit: true, className: "rx-cell" }) +
    S(G.disc(CELL_S, CELL_S + 0.6, CELL_R + 0.5, HEAD, P), { tone: "hi", lit: true }) +
    `<path class="rx-beam" data-part="beam" d="${k.pathOf([at(G.pointOf(HEAD, -ROD_S, 0, 0)), at(G.pointOf(HEAD, ROD_S, 0, 0))])}"/>`;
  put(G.pointOf(HEAD, 0, 0, 0), cell);
  const atoms = [];
  for (let i = 0; i < 22; i++) {
    const s = -CELL_S + 1 + ((i * 7.31) % 1) * (2 * CELL_S - 2);
    const r = (CELL_R - 0.9) * Math.sqrt((i * 3.77) % 1);
    atoms.push(at(G.pointOf(HEAD, s, r, i * 2.4)));
  }
  lay.put(G.pointOf(HEAD, 0.01, 0, 0), T("atoms", `<g class="rx-atoms">${D(atoms, { size: 0.5, tone: "lit" })}</g>`));
  put(G.pointOf(HEAD, (ROD_S + CAP_S) / 2, 0, 0), cap(ROD_S, CAP_S) + L(G.circleOf(HEAD, CAP_S, 3, P, 40), { tone: "lo" }) + S(G.disc(CAP_S, CAP_S + 1.2, 2, HEAD, P), { tone: "hi" }));
  return lay.svg();
}

// ---------- the fiber from the bracket to the sensor ----------
function cable() {
  const face = BRX + BR_T;
  const start = [face + 6.5, PORTS.fiber, PORT_Z];
  const end = G.pointOf(BASE_PORT, 2, 0, 0);
  const lead = [end[0] + PORT_N[0] * 10, end[1] + PORT_N[1] * 10, 1.2];
  const route = G.fillet([start, [face + 14, PORTS.fiber, PORT_Z], [face + 17, PORTS.fiber + 12, 12], [face + 17, lead[1] + 6, 1.2], lead, end], 8, 10, { P, tube: 1.1 });
  return T("fiber", tubePieces(route, 1.1, P, { maxLength: 14 }).map((piece) => `<g class="rx-jacket">${tubeSvg(piece, { tone: "hi" })}</g>`).join(""));
}

export function sceneSvg() {
  const r = riser();
  return k.figureSvg({
    width: WIDTH,
    height: HEIGHT,
    label: "An open AI server chassis with fans, two GPU modules, memory and a CPU heat sink. On a riser above the motherboard sits the PhyQ Mini PCIe card: two chip-scale lasers, a photonic chip, an FPGA, a shielded rubidium clock cell and a disciplined oscillator. Its rear bracket carries 10 MHz, 1 PPS and GNSS connectors and a fiber port; the yellow fiber runs to a small metal-free sensor head holding a rubidium vapor cell on a stand outside the server.",
    body: [
      `<g id="rx-scene">`,
      plate(),
      chassis(),
      server(),
      r.back,
      card(),
      r.slot,
      parts(),
      `<g data-asm="bracket">${bracket()}</g>`,
      lips(),
      `<g data-asm="stand">${stand()}</g>`,
      `<g data-asm="head">${head()}</g>`,
      `<g data-asm="cable">${cable()}</g>`,
      `</g>`,
      `<rect class="rx-veil" x="-200" y="-200" width="${WIDTH + 400}" height="${HEIGHT + 400}"/>`,
      `<g class="rx-spot" aria-hidden="true"></g>`,
    ],
  });
}
