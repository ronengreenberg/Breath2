// The guided tour of PhyQ Mini: one stop per part, then why it belongs in an AI server.
// `show` lists the drawing's data-tour groups to spotlight; a stop with no `show` frames the whole server.
import { MODEL } from "./model.mjs";

export const STOPS = [
  {
    id: "head",
    title: "Rydberg RF sensor",
    show: ["head"],
    field: 1.2,
    text: "A fingertip-sized rubidium vapor cell, outside the chassis. The atoms are the antenna: no metal, MHz to hundreds of GHz.",
  },
  {
    id: "atoms",
    title: "Rydberg atoms",
    show: ["atoms"],
    field: 2.0,
    diagram: "ladder",
    text: "780 nm and 480 nm light lift each atom to a giant Rydberg state that feels the faintest RF field.",
  },
  {
    id: "fiber",
    title: "Fiber link",
    show: ["fiber"],
    field: 1.2,
    text: "Only light travels to the sensor and back. No cable to pick up interference.",
  },
  {
    id: "lasers",
    title: "Lasers · 780 + 480 nm",
    show: ["lasers"],
    field: 1.2,
    text: "Two chip-scale lasers, locked to rubidium. They drive both the sensor and the clock.",
  },
  {
    id: "photonics",
    title: "Photonic chip",
    show: ["photonics"],
    field: 1.2,
    text: "Splits, modulates and detects the light on one chip, replacing a bench of optics.",
  },
  {
    id: "fpga",
    title: "RF readout",
    show: ["fpga"],
    sweep: true,
    diagram: "eit",
    text: "An RF field splits the EIT peak in two. The FPGA reads the gap: field strength in SI units, no calibration.",
  },
  {
    id: "clockcell",
    title: "Rubidium clock cell",
    show: ["clockcell"],
    field: 0,
    lcd: "clock",
    diagram: "cpt",
    text: "A MEMS rubidium cell, heated and shielded. Its 6.835 GHz resonance is the clock's reference.",
  },
  {
    id: "oscillator",
    title: "Disciplined oscillator",
    show: ["oscillator"],
    field: 0,
    lcd: "clock",
    diagram: "loop",
    text: "The same lasers lock this oscillator to rubidium. Stability 1 × 10⁻¹¹.",
  },
  {
    id: "bracket",
    title: "Rear bracket",
    show: ["bracket"],
    field: 0,
    lcd: "clock",
    text: "10 MHz and 1 PPS out, GNSS in, the sensor fiber and a lock LED.",
  },
  {
    id: "power",
    title: "Power",
    show: ["power"],
    field: 1.2,
    text: "Clean rails straight from the PCIe slot. No external supply.",
  },
  {
    id: "pcie",
    title: "PCIe slot",
    show: ["pcie"],
    field: 1.2,
    text: "A standard PCIe slot. The host reads atomic time and RF data directly.",
  },
  {
    id: "server",
    title: "Built for AI servers",
    show: ["gpus"],
    field: 1.2,
    lcd: "clock",
    diagram: "sync",
    text: "Thousands of GPUs must share one clock. PhyQ Mini puts an atomic reference in every rack.",
  },
  {
    id: "resilience",
    title: "No GPS? No problem.",
    show: [],
    field: 2.6,
    lcd: "clock",
    diagram: "hold",
    text: "If GPS is jammed, the clock keeps time and the sensor spots the jammer.",
  },
];

// Opening and closing views: the whole server, assembled, with nothing spotlit.
export const OVERVIEW = {
  title: "PhyQ Mini",
  step: "Quantum RF sensor · atomic clock · PCIe",
  text: "A quantum receiver and an atomic clock on one PCIe card.",
  end: "Atomic time for every GPU. Every signal heard. One PCIe card.",
};

// Time distribution: PhyQ Mini feeds the same atomic time to every GPU node in the rack.
export const SYNC = `<svg class="rx-diagram" viewBox="0 0 320 172" role="img" aria-label="PhyQ Mini sends 10 MHz, 1 PPS and PTP time to four GPU nodes, so all of them share one atomic clock.">
  <g class="rx-dg-box"><rect x="14" y="62" width="92" height="48" rx="6"/>
    ${[14, 54, 94, 134].map((y) => `<rect x="214" y="${y}" width="92" height="28" rx="5"/>`).join("")}
  </g>
  ${[28, 68, 108, 148].map((y) => `<path class="rx-dg-lock" d="M106 86C160 86 160 ${y} 214 ${y}"/>`).join("")}
  <g class="rx-dg-label rx-dg-center">
    <text x="60" y="83">PhyQ Mini</text><text x="60" y="97" class="rx-dg-note">Rb reference</text>
    ${[14, 54, 94, 134].map((y, i) => `<text x="260" y="${y + 18}">GPU node ${i + 1}</text>`).join("")}
  </g>
  <text class="rx-dg-tag rx-dg-lock-t" x="60" y="132" text-anchor="middle">PTP · 1 PPS · 10 MHz</text>
  <text class="rx-dg-tag rx-dg-out-t" x="60" y="150" text-anchor="middle">one clock, every node</text>
</svg>`;

// Holdover: GPS drops out, PhyQ keeps time and flags the interference.
export const HOLD = `<svg class="rx-diagram" viewBox="0 0 320 160" role="img" aria-label="Timeline: GPS time is lost while jammed, PhyQ Mini's clock keeps running through the outage and its RF sensor detects the jammer.">
  <g class="rx-dg-label"><text x="14" y="36">GPS</text><text x="14" y="86">PhyQ clock</text><text x="14" y="136">RF sensor</text></g>
  <path class="rx-dg-out" d="M96 32H160"/><path class="rx-dg-out" d="M250 32H306"/>
  <path class="rx-dg-probe" d="M164 26L178 38M178 26L164 38M196 26L210 38M210 26L196 38M228 26L242 38M242 26L228 38"/>
  <text class="rx-dg-tag rx-dg-probe-t" x="205" y="54" text-anchor="middle">jammed</text>
  <path class="rx-dg-out" d="M96 82H306"/>
  <text class="rx-dg-tag rx-dg-out-t" x="205" y="104" text-anchor="middle">holdover ≈ 1 µs a day</text>
  <path class="rx-dg-rf" d="M96 132H160"/><path class="rx-dg-lock" d="M160 132H250"/><path class="rx-dg-rf" d="M250 132H306"/>
  <text class="rx-dg-tag rx-dg-lock-t" x="205" y="152" text-anchor="middle">jammer detected</text>
</svg>`;

// The clock loop: oscillator → modulated laser → cell → photodiode → FPGA servo → oscillator.
export const LOOP = `<svg class="rx-diagram" viewBox="0 -2 320 172" role="img" aria-label="Clock loop: the oscillator modulates the 780 nm laser, the light crosses the rubidium cell, a photodiode measures it, and the FPGA corrects the oscillator.">
  <path class="rx-dg-out" d="M70 22V6"/><path class="rx-dg-out" d="M66 10L70 4L74 10"/>
  <text class="rx-dg-tag rx-dg-out-t" x="80" y="13">10 MHz · 1 PPS out · 1 × 10⁻¹¹</text>
  <path class="rx-dg-loop" d="M70 40H250V130H70Z"/>
  <g class="rx-dg-box">
    <rect x="18" y="22" width="104" height="36" rx="6"/><rect x="198" y="22" width="104" height="36" rx="6"/>
    <rect x="198" y="112" width="104" height="36" rx="6"/><rect x="18" y="112" width="104" height="36" rx="6"/>
  </g>
  <g class="rx-dg-label rx-dg-center">
    <text x="70" y="38">Oscillator</text><text x="70" y="51" class="rx-dg-note">3.417 GHz</text>
    <text x="250" y="38">780 nm laser</text><text x="250" y="51" class="rx-dg-note">modulated</text>
    <text x="250" y="128">Rb clock cell</text><text x="250" y="141" class="rx-dg-note">MEMS, shielded</text>
    <text x="70" y="128">FPGA servo</text><text x="70" y="141" class="rx-dg-note">via photodiode</text>
  </g>
  <circle class="rx-dg-pulse" r="4.5"/>
</svg>`;

// The CPT resonance, peaked at the rubidium-87 hyperfine frequency.
export const CPT = `<svg class="rx-diagram" viewBox="0 0 320 174" role="img" aria-label="Coherent population trapping resonance: transmission peaks when the sideband spacing equals 6 834 682 611 hertz, where the clock locks.">
  <g class="rx-dg-axis"><path d="M30 138H300"/><path d="M30 138V20"/></g>
  <path class="rx-dg-curve" d="${Array.from({ length: 161 }, (_, i) => { const x = 30 + (270 * i) / 160; const d = (x - 165) / 9; return `${i ? "L" : "M"}${x.toFixed(1)} ${(132 - 96 / (1 + d * d)).toFixed(1)}`; }).join("")}"/>
  <path class="rx-dg-lock" d="M165 138V26"/>
  <g class="rx-dg-label">
    <text x="165" y="153" text-anchor="middle">6 834 682 611 Hz</text>
    <text x="36" y="28">transmission</text>
    <text x="300" y="168" text-anchor="end" class="rx-dg-note">sideband spacing →</text>
  </g>
  <text class="rx-dg-tag rx-dg-lock-t" x="172" y="40">lock</text>
</svg>`;

// Energy ladder of rubidium for the Rydberg stop, with an electron that climbs.
export const LADDER = `<svg class="rx-diagram" viewBox="-16 0 336 168" role="img" aria-label="Energy levels of rubidium: 780 nanometre probe from 5S to 5P, 480 nanometre coupling from 5P to the Rydberg state nD, and an RF photon between nD and the neighbouring Rydberg state.">
  <g class="rx-dg-level">
    <path d="M40 150H140"/><path d="M40 106H140"/><path d="M40 44H140"/><path d="M150 26H250"/>
  </g>
  <g class="rx-dg-label">
    <text x="146" y="154">5S½  ground</text>
    <text x="146" y="110">5P3/2</text>
    <text x="34" y="48" text-anchor="end">nD5/2</text>
    <text x="256" y="30">(n+1)P3/2</text>
    <text x="34" y="36" text-anchor="end" class="rx-dg-note">Rydberg</text>
  </g>
  <path class="rx-dg-probe" d="M70 148V110"/><path class="rx-dg-probe" d="M66 114L70 108L74 114"/>
  <text class="rx-dg-tag rx-dg-probe-t" x="78" y="132">780 nm probe</text>
  <path class="rx-dg-coupling" d="M70 104V48"/><path class="rx-dg-coupling" d="M66 52L70 46L74 52"/>
  <text class="rx-dg-tag rx-dg-coupling-t" x="78" y="80">480 nm coupling</text>
  <path class="rx-dg-rf" d="M145 43q-4 -2 0 -4t0 -4t0 -4t0 -4"/>
  <text class="rx-dg-tag rx-dg-rf-t" x="154" y="56">RF field</text>
  <circle class="rx-dg-electron" cx="70" cy="150" r="4"/>
</svg>`;

// EIT plot: probe transmission against coupling detuning. The path is filled in live from the field.
export const EIT = `<svg class="rx-diagram" viewBox="0 0 300 168" role="img" aria-label="Probe transmission against coupling-laser detuning. One EIT peak at zero field, splitting into two Autler–Townes peaks as the RF field grows.">
  <g class="rx-dg-axis"><path d="M30 140H284"/><path d="M30 140V18"/><path d="M157 140V146"/></g>
  <g class="rx-dg-label">
    <text x="157" y="160" text-anchor="middle">0</text>
    <text x="30" y="160">−${MODEL.span} MHz</text>
    <text x="284" y="160" text-anchor="end">+${MODEL.span} MHz</text>
    <text x="36" y="26">probe transmission</text>
  </g>
  <path class="rx-dg-curve" id="rx-eit-path" d=""/>
  <g class="rx-dg-gap" id="rx-eit-gap"><path d=""/><text x="157" y="0" text-anchor="middle"></text></g>
</svg>`;

// The EIT plot's curve and the Δ bracket for a given field, in the plot's own coordinates.
export function eitPlotOf(field) {
  const { span, width, perVm } = MODEL;
  const half = (field * perVm) / 2;
  const g = width / 2;
  const lorentz = (d) => (g * g) / (d * d + g * g);
  const X = (d) => 157 + (d / span) * 127;
  const Y = (t) => 136 - t * 112;
  const out = [];
  for (let i = 0; i <= 160; i++) {
    const d = -span + (2 * span * i) / 160;
    out.push(`${i ? "L" : "M"}${X(d).toFixed(1)} ${Y(0.06 + 0.94 * 0.5 * (lorentz(d - half) + lorentz(d + half))).toFixed(1)}`);
  }
  const peak = Y(0.06 + 0.94 * 0.5 * (1 + lorentz(2 * half))) - 10;
  const gap = half * 2 > width ? `M${X(-half).toFixed(1)} ${peak.toFixed(1)}h0V${(peak - 6).toFixed(1)}M${X(-half).toFixed(1)} ${(peak - 3).toFixed(1)}H${X(half).toFixed(1)}M${X(half).toFixed(1)} ${peak.toFixed(1)}V${(peak - 6).toFixed(1)}` : "";
  return { d: out.join(""), gap, label: gap ? `Δ ${(field * perVm).toFixed(1)} MHz` : "one peak: Δ under the linewidth", labelX: gap ? 157 : 228, labelY: gap ? peak - 10 : 64 };
}
