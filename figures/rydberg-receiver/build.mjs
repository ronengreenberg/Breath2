import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../.claude/skills/anatomy/kit/iso-kit.mjs";
import * as G from "../../.claude/skills/anatomy/kit/lathe.mjs";
import { tubePieces, tubeSvg } from "../../.claude/skills/anatomy/kit/tube.mjs";
import { kitScript } from "../../.claude/skills/anatomy/scripts/inline-kit.mjs";
import { MODEL, traceOf, splitOf, cptTraceOf } from "./model.mjs";
import { STOPS, LADDER, EIT, eitPlotOf, OVERVIEW, LOOP, CPT } from "./guide.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 640;
const HEIGHT = 440;

// Bench plate under both instruments.
const PLATE = { x: -152, y: -96, w: 340, d: 196, r: 9 };
const PLATE_H = 9;
const FOOT_H = 5;

// Receiver case: a tray with a fixed front panel, and a cover (side walls, lid, heat sink) that lifts off.
const CASE = { x: -120, y: -55, w: 190, d: 100, r: 1.5 };
const FRONT = CASE.y + CASE.d; // 45
const SIDE = CASE.x + CASE.w; // 70
const WALL = 3;
const Z0 = 3; // case bottom, on its feet
const FLOOR = Z0 + 2;
const RIM = 33; // top of walls and front panel
const LID = { ...k.insetPlan(CASE, -2.5), r: 4 };
const LID_TOP = RIM + 9;
const SINK = { x: -104, y: -47, w: 160, d: 86, r: 3 };
const SINK_TOP = LID_TOP + 2;
const FIN_TOP = SINK_TOP + 12;
const FINS = 16;
const MOVE = [0, -112, 20]; // the cover slides back off the chassis and lifts clear

// Front panel layout (face at y = FRONT).
const BEZEL = { x0: -112, x1: -40, z0: 8, z1: 29, r: 2.4, depth: 1.2 };
const LCD = { x0: -109.5, x1: -42.5, z0: 10.5, z1: 26.5, r: 1.2, depth: 1.4 };
const PORT_Z = 18;
const FIBER_X = -26;
const RF_X = 2;
const PWR_X = 30;

// Sensor head on its mast.
const STAND = [146, 34];
const BASE_R = 16;
const BASE_H = 5;
const ZH = 92; // head axis height
const CAP_R = 10;
const CELL_R = 5.6;
const ROD_R = 1.1;
const ROD_AT = 7.8;
const CELL_S = 13.5; // half length of the cell
const ROD_S = 16.2; // half length of the tie rods; caps run from here to CAP_S
const CAP_S = 21.6;

const P = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    ...k.boxCorners({ ...LID, y: LID.y + MOVE[1] }, FLOOR + MOVE[2], FIN_TOP + MOVE[2]),
    [STAND[0] - CAP_S - 2, STAND[1], ZH + CAP_R + 3],
    [STAND[0] + CAP_S + 2, STAND[1], ZH + CAP_R + 3],
  ],
  WIDTH,
  HEIGHT,
  { pad: 28, azimuth: 60, elevation: 36 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const V = G.viewOf(P);
const depth = (p) => G.dot3(p, V);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const planeOf = (y) => k.sideMatrix([0, y], 0, P, "left");
const flat = (x0, z0, x1, z1, r, steps = 6) => k.pathOf(k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, steps).map(([u, z]) => [u, -z]), true);
const sideSlot = (x, y, z0, z1, half = 0.8) => k.pathOf(k.roundedPlan({ x: y - half, y: z0, w: half * 2, d: z1 - z0, r: half }, 4).map(([u, z]) => at([x, u, z])), true);
const alongY = (x, y, z) => G.frameOf([x, y, z], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
const alongX = (x, y, z) => G.frameOf([x, y, z], [1, 0, 0], [0, -1, 0], [0, 0, 1]);

// Every part the tour can spotlight sits in its own group, so a <use> can draw it again above the veil.
let tours = 0;
const T = (part, svg) => `<g data-tour="${part}" id="rx-t${tours++}">${svg}</g>`;

let clips = 0;
function recess({ x0, x1, z0, z1, r, depth: deep }, y, back = "", backClass = "rx-well", inside = "") {
  const id = `rx-clip-${clips++}`;
  const ring = k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, 6);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const { sinA } = k.cameraOf(P);
  const tops = [];
  const sides = [[], [], [], []];
  ring.forEach(([ax, az], index) => {
    const [bx, bz] = ring[(index + 1) % ring.length];
    const length = Math.hypot(bx - ax, bz - az) || 1;
    let [nx, nz] = [(bz - az) / length, -(bx - ax) / length];
    if (nx * (cx - (ax + bx) / 2) + nz * (cz - (az + bz) / 2) < 0) [nx, nz] = [-nx, -nz];
    if (nx <= 0 && nz <= 0) return;
    const quad = k.pathOf([at([ax, y, az]), at([bx, y, bz]), at([bx, y - deep, bz]), at([ax, y - deep, az])], true);
    if (nz >= nx) tops.push(quad);
    else sides[Math.min(3, Math.max(0, Math.floor(((nx * -sinA + 1) / 2) * 4)))].push(quad);
  });
  const shape = flat(x0, z0, x1, z1, r);
  return [
    `<clipPath id="${id}"><path transform="${planeOf(y)}" d="${shape}"/></clipPath>`,
    `<g clip-path="url(#${id})">`,
    `<path class="iso-top" d="${tops.join("")}"/>`,
    ...sides.map((d, shade) => (d.length ? `<path class="iso-shade" data-shade="${shade}" d="${d.join("")}"/>` : "")),
    `<g transform="${planeOf(y - deep)}"><path class="${backClass}" d="${shape}"/>${back}<path class="iso-line" data-tone="faint" d="${shape}"/></g>`,
    inside,
    `</g>`,
    `<g transform="${planeOf(y)}"><path class="iso-line" data-tone="lo" d="${shape}"/></g>`,
  ].join("");
}

// ---------- bench plate ----------
function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 22))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(PLATE, -PLATE_H + 3, P, 8), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // ruler strip along the front-left edge
  const strip = { x: -138, y: PLATE.y + PLATE.d - 15, w: 96, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
  // label plate front-right
  const label = { x: 152, y: 80, w: 26, d: 14, r: 1.2 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.6), 0.8, P, 3), { tone: "faint" }));
  out.push(L([16, 11, 14].map((w, i) => k.lineOnTop([label.x + 4, label.y + 4 + i * 3], [label.x + 4 + w, label.y + 4 + i * 3], 0.8, P)).join(""), { tone: "lo", free: true }));
  out.push(D([at([label.x + label.w - 3, label.y + 3, 0.8]), at([label.x + label.w - 3, label.y + label.d - 3, 0.8])], { size: 0.45 }));
  return out.join("");
}

// ---------- receiver: tray, cover, panel ----------
const wallPlans = {
  back: { x: CASE.x, y: CASE.y, w: CASE.w, d: WALL, r: 1 },
  left: { x: CASE.x, y: CASE.y + WALL, w: WALL, d: CASE.d - 2 * WALL, r: 0.6 },
  right: { x: SIDE - WALL, y: CASE.y + WALL, w: WALL, d: CASE.d - 2 * WALL, r: 0.6 },
  front: { x: CASE.x, y: FRONT - WALL, w: CASE.w, d: WALL, r: 1 },
};

function tray() {
  const out = [`<path class="iso-halo" d="${k.haloOf(CASE, 0, 10, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(CASE, 12))) {
    out.push(S(k.cylinder(x, y, 5, 0, 1.2, P, 24), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 4, 1.2, Z0 - 1.2, P, 24), { tone: "mid" }));
  }
  out.push(S(k.slabOf(CASE, Z0, FLOOR - Z0, P, 3, 0.4), { tone: "lo" }));
  return out.join("");
}

function coverBack() {
  return [
    S(k.slabOf(wallPlans.back, FLOOR, RIM - FLOOR, P, 2, 0.4), { tone: "mid" }),
    S(k.slabOf(wallPlans.left, FLOOR, RIM - FLOOR, P, 2, 0.4), { tone: "mid" }),
  ].join("");
}

function coverRight() {
  const out = [S(k.slabOf(wallPlans.right, FLOOR, RIM - FLOOR, P, 2, 0.4), { tone: "mid", inner: L(k.sideSeam(wallPlans.right, FLOOR + 4, P, 2), { tone: "faint" }) })];
  const rows = Array.from({ length: 11 }, (_, i) => -36 + i * 4.2);
  out.push(L(rows.map((y) => sideSlot(SIDE, y, 13, 27)).join(""), { tone: "faint" }));
  out.push(D([at([SIDE, -48, 30]), at([SIDE, 36, 30]), at([SIDE, -48, 9]), at([SIDE, 36, 9])], { size: 0.45 }));
  return out.join("");
}

function lid() {
  const out = [];
  out.push(S(k.slabOf(LID, RIM, LID_TOP - RIM, P, 6, 1.2), { tone: "mid", inner: L(k.sideSeam(LID, RIM + 2.4, P, 6), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(LID, 4), LID_TOP, P, 6), { tone: "faint" }));
  const screws = k.corners(LID, 6);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 1.8, LID_TOP, P, 14)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, LID_TOP])), { size: 0.45 }));
  out.push(S(k.slabOf(SINK, LID_TOP, SINK_TOP - LID_TOP, P, 4, 0.5), { tone: "mid" }));
  const gap = (SINK.w - 8) / (FINS - 1);
  for (let i = 0; i < FINS; i++) {
    const fin = { x: SINK.x + 3 + i * gap, y: SINK.y + 3, w: 2, d: SINK.d - 6, r: 0.6 };
    out.push(S(k.slabOf(fin, SINK_TOP, FIN_TOP - SINK_TOP, P, 2, 0.3), { tone: "mid", crease: "lo" }));
  }
  return out.join("");
}

// ---------- receiver internals ----------
const BOARD = { x: -114, y: -50, w: 92, d: 54, r: 2 };
const BOARD_TOP = FLOOR + 2;
const PCB = { x: -16, y: -50, w: 80, d: 88, r: 2 };
const PCB_Z = FLOOR + 2;
const PCB_TOP = PCB_Z + 1.6;

function box(plan, z, h, tone = "mid", extra = "") {
  return S(k.slabOf(plan, z, h, P, 3, 0.5), { tone }) + extra;
}

function internals() {
  const flatItems = [];
  // optical breadboard with tapped holes
  flatItems.push(S(k.slabOf(BOARD, FLOOR, BOARD_TOP - FLOOR, P, 3, 0.4), { tone: "lo" }));
  const holes = [];
  for (let x = BOARD.x + 4; x < BOARD.x + BOARD.w - 2; x += 6) for (let y = BOARD.y + 4; y < BOARD.y + BOARD.d - 2; y += 6) holes.push(at([x, y, BOARD_TOP]));
  flatItems.push(D(holes, { size: 0.35, tone: "lo" }));
  // electronics board on standoffs
  for (const [x, y] of byDepth(k.corners(PCB, 4))) flatItems.push(S(k.cylinder(x, y, 1.6, FLOOR, PCB_Z - FLOOR, P, 14), { tone: "mid" }));
  flatItems.push(T("electronics", S(k.slabOf(PCB, PCB_Z, PCB_TOP - PCB_Z, P, 3), { tone: "lo" }) + L(k.planOutline(k.insetPlan(PCB, 3), PCB_TOP, P, 3), { tone: "faint" })));

  const items = [];
  const put = (centre, svg, part) => items.push({ key: depth(centre), svg: part ? T(part, svg) : svg });

  // probe laser, 852 nm
  const probe = { x: -108, y: -45, w: 30, d: 14, r: 2 };
  put([-93, -38, 13], box(probe, BOARD_TOP, 12, "hi", L(k.planOutline(k.insetPlan(probe, 2.5), BOARD_TOP + 12, P, 3), { tone: "faint" }) + D([at([probe.x + 3, probe.y + 3, BOARD_TOP + 12]), at([probe.x + probe.w - 3, probe.y + probe.d - 3, BOARD_TOP + 12])], { size: 0.4 })), "probe");
  // coupling laser, 510 nm, with TEC fins
  const coupling = { x: -108, y: -24, w: 30, d: 16, r: 2 };
  let fins = "";
  for (let i = 0; i < 6; i++) fins += S(k.slabOf({ x: coupling.x + 3 + i * 4.6, y: coupling.y + 2, w: 1.4, d: coupling.d - 4, r: 0.4 }, BOARD_TOP + 13, 3, P, 2), { tone: "mid" });
  put([-93, -16, 14], box(coupling, BOARD_TOP, 13, "hi", fins), "coupling");
  // collimator barrels into the dichroic combiner
  const barrel = (y, z) => {
    const F = alongX(-78, y, z);
    return S(G.disc(0, 4, 3, F, P), { tone: "mid" }) + S(G.disc(4, 5, 2.4, F, P), { tone: "mid" });
  };
  put([-75, -38, 13], barrel(-38, BOARD_TOP + 6), "probe");
  put([-75, -16, 14], barrel(-16, BOARD_TOP + 6.5), "coupling");
  // dichroic combiner block
  const combiner = { x: -73, y: -44, w: 13, d: 34, r: 1.5 };
  const window_ = { ...k.insetPlan(combiner, 2), r: 0.6 };
  put([-66, -27, 12], box(combiner, BOARD_TOP, 11, "mid", L(k.planOutline(window_, BOARD_TOP + 11, P, 2) + k.lineOnTop([window_.x + 2, window_.y], [window_.x + window_.w - 2, window_.y + window_.d], BOARD_TOP + 11, P), { tone: "lo" })), "launch");
  // fiber launcher on the combiner face
  const launch = alongX(-60, -27, BOARD_TOP + 6);
  put([-57, -27, 13], S(G.disc(0, 3, 2.6, launch, P), { tone: "mid" }) + S(G.disc(3, 5, 1.6, launch, P), { tone: "mid" }), "launch");
  // photodiode for the returning probe light
  const pd = { x: -58, y: -10, w: 12, d: 10, r: 1.5 };
  put([-52, -5, 11], box(pd, BOARD_TOP, 7, "mid", L(k.ring(pd.x + 6, pd.y + 5, 2, BOARD_TOP + 7, P, 16), { tone: "lo" })), "photodiode");

  // internal fibers to the front bulkhead
  const fiber = (points) => {
    const route = G.fillet(points, 5, 7, { P, tube: 0.6 });
    for (const piece of tubePieces(route, 0.6, P, { maxLength: 10 })) put(piece.mid, `<g class="rx-fiber">${tubeSvg(piece, { tone: "lo" })}</g>`, "fiber");
  };
  fiber([[-55, -27, BOARD_TOP + 6], [-36, -27, BOARD_TOP + 6], [-36, 30, BOARD_TOP + 6], [FIBER_X - 2, 34, PORT_Z], [FIBER_X - 2, FRONT - WALL - 4, PORT_Z]]);
  fiber([[-46, -5, BOARD_TOP + 4], [-31, -5, BOARD_TOP + 4], [-31, 26, BOARD_TOP + 4], [FIBER_X + 2, 34, PORT_Z], [FIBER_X + 2, FRONT - WALL - 4, PORT_Z]]);
  const bulk = { x: FIBER_X - 6, y: FRONT - WALL - 4, w: 12, d: 4, r: 1 };
  put([FIBER_X, FRONT - WALL - 2, PORT_Z], box(bulk, PORT_Z - 6, 12, "mid"), "fiber");

  // electronics
  const fpga = { x: 6, y: -30, w: 20, d: 20, r: 1 };
  let sink = "";
  for (let i = 0; i < 5; i++) sink += S(k.slabOf({ x: fpga.x + 2 + i * 3.6, y: fpga.y + 2, w: 1.2, d: fpga.d - 4, r: 0.3 }, PCB_TOP + 2.6, 3.4, P, 2), { tone: "mid" });
  put([16, -20, 11], box(fpga, PCB_TOP, 2.6, "mid", sink), "electronics");
  for (const [x, y] of [[-10, -46], [-10, -36]]) put([x + 5, y + 3, 10], box({ x, y, w: 10, d: 6, r: 0.6 }, PCB_TOP, 1.4, "mid", D([0, 1, 2, 3].map((i) => at([x + 2 + i * 2, y + 6, PCB_TOP])), { size: 0.3 })), "electronics");
  const can = { x: -12, y: -22, w: 12, d: 20, r: 1 };
  put([-6, -12, 12], box(can, PCB_TOP, 6, "mid", D(k.dotGrid(can.x + 3, can.y + 3, 3, 5, 3.4, PCB_TOP + 6, P), { size: 0.35, tone: "lo" })), "electronics");
  const psu = { x: 34, y: -46, w: 26, d: 30, r: 2 };
  const vents = Array.from({ length: 7 }, (_, i) => k.planOutline({ x: psu.x + 4, y: psu.y + 4 + i * 3.2, w: psu.w - 8, d: 1.2, r: 0.6 }, PCB_TOP + 14, P, 3)).join("");
  put([47, -31, 16], box(psu, PCB_TOP, 14, "mid", L(vents, { tone: "faint" })), "psu");
  const osc = { x: 34, y: -8, w: 20, d: 20, r: 2 };
  put([44, 2, 14], box(osc, PCB_TOP, 9, "mid", L(k.planOutline(k.insetPlan(osc, 3), PCB_TOP + 9, P, 3), { tone: "faint" }) + D(k.corners(osc, 2.2).map(([x, y]) => at([x, y, PCB_TOP + 9])), { size: 0.4 })), "clock");
  for (const [x, y] of [[-6, 4], [-1, 4], [4, 4], [26, -40], [26, -33]]) put([x, y, 12], S(k.cylinder(x, y, 2, PCB_TOP, 6, P, 18), { tone: "mid" }) + L(k.ring(x, y, 1.2, PCB_TOP + 6, P, 12), { tone: "faint" }), x > 20 ? "psu" : "electronics");

  items.sort((a, b) => a.key - b.key);
  return flatItems.join("") + items.map((item) => item.svg).join("");
}

// ---------- front panel ----------
function screen() {
  const trace = traceOf(0);
  const grid = [];
  for (const z of [14, 18, 22]) grid.push(`M${LCD.x0} ${-z}H${LCD.x1}`);
  for (let x = LCD.x0 + 8.4; x < LCD.x1; x += 8.4) grid.push(`M${x.toFixed(1)} ${-LCD.z0}V${-LCD.z1}`);
  const back = [
    `<path class="rx-grid" d="${grid.join("")}"/>`,
    `<path class="rx-trace" data-part="trace" d="${trace}"/>`,
    `<text class="rx-text" data-part="lcd-mode" x="${LCD.x0 + 2}" y="${-(LCD.z1 - 3.4)}" font-size="2.4">PhyQ · EIT · Cs 852/510 nm</text>`,
    `<circle class="rx-lock" cx="${LCD.x1 - 12.6}" cy="${-(LCD.z1 - 2.6)}" r="0.8"/>`,
    `<text class="rx-text" x="${LCD.x1 - 11.2}" y="${-(LCD.z1 - 3.4)}" font-size="2.4">LOCKED</text>`,
    `<text class="rx-text" data-part="lcd-e" x="${LCD.x0 + 2}" y="${-(LCD.z0 + 1.2)}" font-size="2.4">E 0.00 V/m</text>`,
    `<text class="rx-text" data-part="lcd-split" x="${LCD.x1 - 2}" y="${-(LCD.z0 + 1.2)}" font-size="2.4" text-anchor="end">Δ 0.0 MHz</text>`,
  ].join("");
  return recess(BEZEL, FRONT, "", "rx-bezel", recess(LCD, FRONT - BEZEL.depth, back, "rx-glass"));
}

function circular(x, label, pins) {
  const F = alongY(x, FRONT, PORT_Z);
  const out = [];
  out.push(S(G.prismOf(F, [[-8.5, -8.5], [8.5, -8.5], [8.5, 8.5], [-8.5, 8.5]], 0, 1.2, P), { tone: "mid" }));
  out.push(D([[-6.4, -6.4], [6.4, -6.4], [6.4, 6.4], [-6.4, 6.4]].map(([u, v]) => at([x + u, FRONT + 1.2, PORT_Z + v])), { size: 0.4 }));
  out.push(S(G.disc(1.2, 3.2, 6.8, F, P), { tone: "mid" }));
  out.push(S(G.disc(3.2, 9.2, 6.2, F, P), { tone: "mid", inner: k.fadedSvg(G.ribsOf(F, 3.2, 9.2, 6.2, 40, P, { fade: [0.1, 0.55] }), { tone: "lo" }) }));
  out.push(L(G.circleOf(F, 9.2, 4.4, P, 48), { tone: "lo" }));
  out.push(D(Array.from({ length: pins }, (_, i) => G.pointOf(F, 9.2, i === pins - 1 ? 0 : 2.6, (i / (pins - 1)) * Math.PI * 2)).map(at), { size: 0.45, tone: "hi" }));
  return out.join("");
}

function fiberPort() {
  const F = alongY(FIBER_X, FRONT, PORT_Z);
  const out = [];
  out.push(S(G.disc(0, 1.2, 5.6, F, P), { tone: "mid" }));
  out.push(S(G.prismOf(F, Array.from({ length: 6 }, (_, i) => [4.4 * Math.cos((i * Math.PI) / 3 + Math.PI / 6), 4.4 * Math.sin((i * Math.PI) / 3 + Math.PI / 6)]), 1.2, 3.6, P), { tone: "mid" }));
  out.push(S(G.disc(3.6, 8, 3.2, F, P), { tone: "mid", inner: k.fadedSvg(G.ribsOf(F, 3.6, 8, 3.2, 22, P, { fade: [0.1, 0.55] }), { tone: "lo" }) }));
  out.push(S(G.disc(8, 12, 2.2, F, P), { tone: "hi", lit: false }));
  return out.join("");
}

function panel() {
  const out = [S(k.slabOf(wallPlans.front, FLOOR, RIM - FLOOR, P, 2, 0.4), { tone: "mid" })];
  out.push(`<g transform="${planeOf(FRONT)}"><path class="iso-line" data-tone="faint" d="${flat(CASE.x + 3, FLOOR + 2.5, SIDE - 3, RIM - 2.5, 2)}"/></g>`);
  out.push(D([[CASE.x + 6, FLOOR + 5.5], [SIDE - 6, FLOOR + 5.5], [CASE.x + 6, RIM - 5.5], [SIDE - 6, RIM - 5.5]].map(([x, z]) => at([x, FRONT, z])), { size: 0.45 }));
  out.push(T("screen", screen()));
  out.push(T("fiber", fiberPort()));
  out.push(T("panel", circular(RF_X, "RF / DATA", 7)));
  out.push(T("panel", circular(PWR_X, "POWER", 4)));
  // status LED and its well
  out.push(`<g transform="${planeOf(FRONT)}"><path class="iso-line" data-tone="lo" d="${flat(48, 15, 62, 21, 3)}"/></g>`);
  out.push(T("panel", `<g data-part="led">${D([at([52, FRONT, 18])], { size: 0.9, tone: "hi" })}</g>` + D([at([58, FRONT, 18])], { size: 0.6, tone: "lo" })));
  return out.join("");
}

// ---------- sensor head ----------
const HEAD = G.frameOf([STAND[0], STAND[1], ZH], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const YOKE_TOP = ZH - CAP_R;
const MAST_TOP = YOKE_TOP - 3;
const PORT_N = [-0.5, Math.sqrt(3) / 2, 0]; // the base's fiber port faces front-left, toward the receiver
const BASE_PORT = G.frameAlong([STAND[0] + BASE_R * PORT_N[0], STAND[1] + BASE_R * PORT_N[1], 2.6], PORT_N);

function stand() {
  const [x, y] = STAND;
  const out = [`<path class="iso-halo" d="${k.haloOf({ x: x - BASE_R, y: y - BASE_R, w: BASE_R * 2, d: BASE_R * 2, r: BASE_R }, 0, 6, P)}"/>`];
  out.push(S(k.cylinder(x, y, BASE_R, 0, BASE_H, P, 72, 0.8), { tone: "mid", inner: L(k.sideArc(x, y, BASE_R, 1.4, P, 48), { tone: "faint" }) }));
  out.push(L(k.ring(x, y, BASE_R - 3, BASE_H, P, 64), { tone: "faint" }));
  out.push(D([0, 1, 2].map((i) => at([x + (BASE_R - 5.5) * Math.cos((i * 2 * Math.PI) / 3 + 0.4), y + (BASE_R - 5.5) * Math.sin((i * 2 * Math.PI) / 3 + 0.4), BASE_H])), { size: 0.45 }));
  // fiber bulkhead on the base front
  out.push(S(G.disc(-1, 2.4, 3, BASE_PORT, P), { tone: "mid" }));
  out.push(S(G.disc(2.4, 4.6, 2.2, BASE_PORT, P), { tone: "mid", inner: k.fadedSvg(G.ribsOf(BASE_PORT, 2.4, 4.6, 2.2, 16, P, { fade: [0.1, 0.55] }), { tone: "lo" }) }));
  // mast: collar, lower tube, clamp, upper tube
  out.push(S(k.cylinder(x, y, 4, BASE_H, 4, P, 28), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 2.2, BASE_H + 4, 44 - BASE_H - 4, P, 20), { tone: "mid", crease: "none" }));
  const clamp = { x: x - 4.5, y: y - 4.5, w: 9, d: 9, r: 2 };
  out.push(S(k.slabOf(clamp, 44, 8, P, 3, 0.5), { tone: "mid" }));
  out.push(S(k.slabOf({ x: x - 1.2, y: y + 4.5, w: 2.4, d: 2.4, r: 0.6 }, 46.5, 3, P, 2), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(x, y + 8.2, 2.2, 45, 6, P, 18), { tone: "mid" }));
  out.push(L(k.knurl(x, y + 8.2, 2.2, 45, 51, 16, P), { tone: "lo" }));
  out.push(S(k.cylinder(x, y, 2.2, 52, MAST_TOP - 52, P, 20), { tone: "mid", crease: "none" }));
  out.push(L([64, 76].map((z) => k.sideArc(x, y, 2.2, z, P, 12)).join(""), { tone: "faint" }));
  // yoke under the caps
  out.push(S(k.slabOf({ x: x - CAP_S, y: y - 5, w: CAP_S * 2, d: 10, r: 1.5 }, MAST_TOP, 3, P, 3, 0.4), { tone: "mid" }));
  return T("stand", out.join(""));
}

function head() {
  const items = [];
  const put = (centre, svg, part = "head") => items.push({ key: depth(centre), svg: T(part, svg) });
  // end caps (fiber collimators), made of dielectric
  const cap = (s0, s1) => S(G.disc(s0, s1, CAP_R, HEAD, P), { tone: "mid", inner: L(G.arcOf(HEAD, (s0 + s1) / 2, CAP_R, P), { tone: "faint" }) });
  put(G.pointOf(HEAD, -(ROD_S + CAP_S) / 2, 0, 0), cap(-CAP_S, -ROD_S));
  // three dielectric tie rods
  for (const angle of [Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6]) {
    const c = G.pointOf(HEAD, 0, ROD_AT, angle);
    put(c, S(G.disc(-ROD_S, ROD_S, ROD_R, G.frameAlong(c, [1, 0, 0]), P), { tone: "mid" }));
  }
  // the vapor cell: glass, cesium inside
  const cell =
    S(G.disc(-CELL_S - 0.8, -CELL_S, CELL_R + 0.6, HEAD, P), { tone: "hi", lit: true }) +
    S(G.disc(-CELL_S, CELL_S, CELL_R, HEAD, P), { tone: "hi", lit: true, className: "rx-cell" }) +
    S(G.disc(CELL_S, CELL_S + 0.8, CELL_R + 0.6, HEAD, P), { tone: "hi", lit: true }) +
    `<path class="rx-beam" data-part="beam" d="${k.pathOf([at(G.pointOf(HEAD, -ROD_S, 0, 0)), at(G.pointOf(HEAD, ROD_S, 0, 0))])}"/>`;
  put(G.pointOf(HEAD, 0, 0, 0), cell, "cell");
  // the atoms: a scatter of dots through the glass, which glow when the Rydberg stop is on
  const atoms = [];
  for (let i = 0; i < 26; i++) {
    const s = -CELL_S + 1.2 + ((i * 7.31) % 1) * (2 * CELL_S - 2.4);
    const r = (CELL_R - 1.2) * Math.sqrt(((i * 3.77) % 1));
    atoms.push(at(G.pointOf(HEAD, s, r, i * 2.4)));
  }
  items.push({ key: depth(G.pointOf(HEAD, 0, 0, 0)) + 0.01, svg: T("atoms", `<g class="rx-atoms">${D(atoms, { size: 0.55, tone: "lit" })}</g>`) });
  const front =
    cap(ROD_S, CAP_S) +
    L(G.circleOf(HEAD, CAP_S, 4.4, P, 48), { tone: "lo" }) +
    S(G.disc(CAP_S, CAP_S + 1.6, 3.2, HEAD, P), { tone: "hi" }) +
    D([0, 1, 2].map((i) => at(G.pointOf(HEAD, CAP_S, 7.2, Math.PI / 2 + (i * 2 * Math.PI) / 3))), { size: 0.45 });
  put(G.pointOf(HEAD, (ROD_S + CAP_S) / 2, 0, 0), front);
  items.sort((a, b) => a.key - b.key);
  return items.map((item) => item.svg).join("");
}

// ---------- the fiber from the receiver to the head ----------
function cable() {
  const start = [FIBER_X, FRONT + 12, PORT_Z];
  const end = G.pointOf(BASE_PORT, 4.6, 0, 0);
  const lead = [end[0] + PORT_N[0] * 12, end[1] + PORT_N[1] * 12, 2];
  const route = G.fillet(
    [start, [FIBER_X, FRONT + 18, PORT_Z], [FIBER_X, FRONT + 26, 1.4], [lead[0] - 30, FRONT + 26, 1.4], lead, end],
    16,
    10,
    { P, tube: 1.4 },
  );
  // boot on the port side
  const boot = S(G.disc(12, 15, 1.9, alongY(FIBER_X, FRONT, PORT_Z), P), { tone: "hi", className: "rx-boot" });
  const pieces = tubePieces(route.slice(0), 1.4, P, { maxLength: 18 });
  return T("fiber", boot + pieces.map((piece) => `<g class="rx-jacket">${tubeSvg(piece, { tone: "hi" })}</g>`).join(""));
}

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A Rydberg-atom RF receiver on a bench plate. A finned case holds two lasers, a dichroic combiner, a photodiode and the readout electronics; its front panel has a spectrum display, a fiber port and two circular connectors. A yellow fiber runs from the port to a stand, where a metal-free head holds a glass cesium vapor cell between two collimators. The screen shows the EIT transmission peak, which splits in two as the RF field grows.",
  body: [
    plate(),
    tray(),
    `<g data-part="cover-back" data-tour="cover" id="rx-cover-back" transform="">${coverBack()}</g>`,
    internals(),
    `<g data-part="cover-right" data-tour="cover" id="rx-cover-right" transform="">${coverRight()}</g>`,
    panel(),
    `<g data-part="lid" data-tour="cover" id="rx-cover-lid" transform="">${lid()}</g>`,
    stand(),
    head(),
    cable(),
    `<rect class="rx-veil" x="-20" y="-20" width="${WIDTH + 40}" height="${HEIGHT + 40}"/>`,
    `<g class="rx-spot" aria-hidden="true"></g>`,
  ],
});

const live = `
const P = ${JSON.stringify(P)};
const MODEL = ${JSON.stringify(MODEL)};
const MOVE = ${JSON.stringify(MOVE)};
const STOPS = ${JSON.stringify(STOPS)};
const LADDER = ${JSON.stringify(LADDER)};
const EIT = ${JSON.stringify(EIT)};
const LOOP = ${JSON.stringify(LOOP)};
const CPT = ${JSON.stringify(CPT)};
const OVERVIEW = ${JSON.stringify(OVERVIEW)};
const CPT_TRACE = ${JSON.stringify(cptTraceOf())};
${traceOf.toString()}
${splitOf.toString()}
${eitPlotOf.toString()}
const STEP_TIME = window.__STEP || 13;
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const trace = svg.querySelector('[data-part="trace"]');
const lcdE = svg.querySelector('[data-part="lcd-e"]');
const lcdSplit = svg.querySelector('[data-part="lcd-split"]');
const lcdMode = svg.querySelector('[data-part="lcd-mode"]');
const beam = svg.querySelector('[data-part="beam"]');
const atoms = svg.querySelector(".rx-atoms");
const spot = svg.querySelector(".rx-spot");
const covers = ["cover-back", "cover-right", "lid"].map((name) => svg.querySelector('[data-part="' + name + '"]'));
const readout = document.querySelector("[data-readout]");
const slider = document.getElementById("rx-field");
const sliderOut = document.getElementById("rx-field-out");
const toggle = document.getElementById("rx-open");
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
let stop = 0, playing = !still.matches, guideClock = 0, sweepClock = 0, focused = true, eitPath = null, eitGap = null;
// The camera: the viewBox eases toward the spotlit part, so the tour points by moving in on it.
const FULL = { x: 0, y: 0, w: ${WIDTH}, h: ${HEIGHT} };
const view = { ...FULL };
function viewTarget() {
  if (!focused || !spot.firstChild) return FULL;
  let box;
  try { box = spot.getBBox(); } catch (error) { return FULL; }
  if (!box.width) return FULL;
  const aspect = FULL.w / FULL.h;
  let w = Math.max(box.width * 1.9, box.height * 1.9 * aspect, FULL.w / 2.6);
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
  guide.diagram.innerHTML = ({ ladder: LADDER, eit: EIT, loop: LOOP, cpt: CPT })[item.diagram] || "";
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
  guide.title.textContent = "The whole instrument";
  guide.text.textContent = "Pick any part from the list, or press Play to walk through them in order. The slider sets the RF field the cell is sitting in.";
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
  guide.step.textContent = end ? "Two instruments" : "Quantum RF receiver · atomic clock";
  guide.title.textContent = OVERVIEW.title;
  guide.text.textContent = end ? OVERVIEW.end : OVERVIEW.text;
  draw();
  run();
}
function draw() {
  const clockMode = focused && STOPS[stop].lcd === "clock";
  trace.setAttribute("d", clockMode ? CPT_TRACE : traceOf(field));
  const split = splitOf(field);
  if (clockMode) {
    const secs = 14 + performance.now() / 1000;
    lcdMode.textContent = "PhyQ · CLOCK · Cs 9.19 GHz";
    lcdE.textContent = "UTC 14:32:" + String(Math.floor(secs % 60)).padStart(2, "0") + "." + Math.floor((secs % 1) * 10);
    lcdSplit.textContent = "LOCK 9 192 631 770 Hz";
  } else {
    lcdMode.textContent = "PhyQ · EIT · Cs 852/510 nm";
    lcdE.textContent = "E " + field.toFixed(2) + " V/m";
    lcdSplit.textContent = "Δ " + split.toFixed(1) + " MHz";
  }
  beam.style.opacity = String(0.55 + 0.45 * Math.min(1, field / 3));
  const t = translateAlong(P, MOVE.map((m) => m * lift.at));
  covers.forEach((g) => g.setAttribute("transform", t));
  const resolved = split > MODEL.width;
  const text = clockMode ? "Clock locked · 9 192 631 770 Hz" : "E " + field.toFixed(2) + " V/m · Δ " + split.toFixed(1) + " MHz" + (resolved ? "" : " (merged)");
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
    if (guideClock >= STEP_TIME) focusStop(stop + 1);
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
  const animating = panning || (focused && playing) || freeTouring || (focused && (STOPS[stop].id === "atoms" || STOPS[stop].sweep || STOPS[stop].lcd) && !calm);
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
const flip = () => { openTarget = openTarget ? 0 : 1; playing = false; draw(); run(); };
stage.addEventListener("click", flip);
toggle.addEventListener("click", flip);
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
window.__tour = { focusStop, showAll, overview, play() { playing = true; focusStop(0); }, stops: STOPS.length };
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
.rx-dg-center text{text-anchor:middle}
.rx-dg-box rect{fill:var(--anatomy-card);stroke:var(--anatomy-mid);stroke-width:1.2}
.rx-dg-loop{fill:none;stroke:var(--rx-glow);stroke-width:1.6;stroke-dasharray:4 4}
.rx-dg-pulse{fill:var(--rx-glow);offset-path:path("M70 40H250V130H70Z");animation:rx-loop 4s linear infinite}
@keyframes rx-loop{from{offset-distance:0%}to{offset-distance:100%}}
.rx-dg-lock{stroke:var(--rx-coupling);stroke-width:1.4;stroke-dasharray:3 3;animation:rx-blink 1.4s ease-in-out infinite}
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
  <button id="rx-open" type="button" aria-pressed="false">Open the case</button>
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
    title: "PhyQ receiver",
    hint: "Follow the tour below, or pick a part",
    readout: "E 0.30 V/m · Δ 2.3 MHz (merged)",
    keys: [
      { mark: "lit", label: "Cesium vapor cell: the antenna. Two lasers excite its atoms to a Rydberg state" },
      { mark: "raised", label: "Receiver: probe (852 nm) and coupling (510 nm) lasers, combiner, photodiode, readout" },
      { mark: "flat", label: "Fiber: carries both beams up to the cell and the probe light back" },
    ],
    caption: `There is no metal antenna. The head holds a glass cell of cesium vapor between two collimators on dielectric rods. The probe laser makes the cell transparent at one coupling-laser frequency (EIT), which shows as the single peak on the screen. An RF field tuned to a Rydberg transition splits that peak in two (Autler–Townes). The splitting is set only by the field and an atomic constant: Δ = (λc/λp)·℘E/h, or ${MODEL.perVm.toFixed(2)} MHz per V/m for an assumed ℘ = ${MODEL.dipole} e·a₀. Below about ${(MODEL.width / MODEL.perVm).toFixed(1)} V/m the two peaks merge into one within the ${MODEL.width} MHz linewidth.`,
    body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Rydberg receiver: arrow keys set the RF field, Enter opens the case" aria-valuemin="0" aria-valuemax="${MODEL.maxField}" aria-valuenow="0.3">${svg}</div>${controls}${guideHtml}`,
  });

const name = theme === "light" ? "rydberg-receiver-light.html" : "rydberg-receiver.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Rydberg receiver", theme, body, script: kitScript() + live }));

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
  const frame = `<title>PhyQ Receiver</title>
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
.vid{position:relative;width:${tall ? 720 : 1280}px;height:${tall ? 1280 : 720}px;display:grid;${tall ? "grid-template-rows:auto 1fr" : "grid-template-columns:760px 1fr"};font:${tall ? 26 : 19}px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--anatomy-strong);-webkit-font-smoothing:antialiased}
.vid-stage{display:flex;align-items:center;justify-content:center;padding:${tall ? "44px 28px 8px" : "28px 0 28px 32px"}}
.vid-stage .iso-stage{width:100%;border-radius:14px;background:var(--anatomy-card);box-shadow:0 1px 2px #0000000d,0 8px 24px -12px #0000001f}
.vid-stage svg{display:block;width:100%;height:auto}
.vid-panel{display:flex;flex-direction:column;gap:${tall ? 24 : 14}px;padding:${tall ? "30px 44px 64px" : "40px 44px 32px 36px"};min-width:0}
.vid-brand{display:flex;align-items:baseline;gap:12px}
.vid-brand b{font-size:${tall ? 40 : 26}px;letter-spacing:-.01em;font-weight:700;color:var(--anatomy-strong)}
.vid-brand span{font:${tall ? 15 : 12}px var(--anatomy-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--anatomy-muted)}
.vid .rx-guide{border-top:0;margin:0;padding:0;gap:${tall ? 16 : 12}px}
.vid .rx-guide-nav,.vid .rx-chips{display:none}
.vid .rx-guide-body,.vid .rx-guide-body:has(#rx-diagram:not([hidden])){grid-template-columns:minmax(0,1fr)}
.vid #rx-step{font-size:${tall ? 22 : 14}px;color:var(--anatomy-muted)}
.vid #rx-title{font-size:${tall ? 44 : 30}px;letter-spacing:-.01em}
.vid #rx-text{font-size:${tall ? 26 : 19}px;line-height:1.5;color:var(--anatomy-strong);max-width:none}
.vid .rx-diagram{max-height:${tall ? 262 : 210}px;background:var(--anatomy-card)}
.vid .rx-dg-label text,.vid .rx-dg-tag{font-size:11px}
.vid .rx-hero .rx-guide-head{flex-direction:column;align-items:flex-start;gap:10px}
.vid .rx-hero #rx-title{font-size:${tall ? 120 : 76}px;line-height:1}
.vid .rx-hero #rx-text{font-size:${tall ? 36 : 23}px}
.vid .rx-hero #rx-step{font-size:${tall ? 18 : 14}px;letter-spacing:.12em;text-transform:uppercase}
.vid-read{margin-top:auto;font:${tall ? 22 : 14}px var(--anatomy-mono);color:var(--anatomy-muted);font-variant-numeric:tabular-nums}
.vid-hidden{position:absolute;left:-9999px;top:0}
.vid-panel:has(.rx-hero) .vid-brand{display:none}
${tall ? ".vid-brand,.vid-read{display:none}" : ""}
</style>`;
  const videoOf = (tall) =>
    k.pageHtml({
      title: "PhyQ video",
      theme: "light",
      width: 1280,
      body: `${css}${videoCss(tall)}<div class="vid">
<div class="vid-stage"><div class="iso-stage" tabindex="0">${svg}</div></div>
<aside class="vid-panel"><div class="vid-brand"><b>PhyQ</b><span>Quantum RF receiver</span></div>${guideHtml}<div class="vid-read"><span data-readout></span></div></aside>
<div class="vid-hidden">${controls}</div>
</div>`,
      script: "window.__STEP = 12;" + kitScript() + live,
    }).replace(".iso-page{width:min(1280px,100% - 32px);margin:64px auto 96px}", ".iso-page{margin:0}");
  writeFileSync(join(HERE, "video.html"), videoOf(false));
  writeFileSync(join(HERE, "video-tall.html"), videoOf(true));
  console.log("wrote video.html, video-tall.html");
  console.log("wrote artifact.html");
}
console.log("wrote", name);
