// The guided tour: one stop per part, in the order the light and the signal travel.
// `show` lists the drawing's data-tour groups to spotlight; `open` slides the cover off for parts inside the case.
import { MODEL } from "./model.mjs";

const perVm = MODEL.perVm.toFixed(2);

export const STOPS = [
  {
    id: "cell",
    title: "Vapor cell: the antenna",
    show: ["cell"],
    field: 1.2,
    text: "A sealed glass cylinder holding a trace of cesium vapor at room temperature. The atoms inside are the sensor: they respond to the RF field directly, so the head has no metal element to pick up or distort the signal. By tuning the coupling laser to a different Rydberg state, the same cell can listen from hundreds of megahertz to hundreds of gigahertz.",
  },
  {
    id: "atoms",
    title: "Rydberg atoms",
    show: ["atoms"],
    field: 2.0,
    diagram: "ladder",
    text: "The two lasers lift each cesium atom's outer electron in two steps: 852 nm from the ground state 6S to 6P, then 510 nm on to a Rydberg state with n ≈ 50. The orbit grows as n², so the atom swells to roughly a quarter of a micrometre, hundreds of times its normal size, with a huge electric dipole. An RF field tuned to the gap between two neighbouring Rydberg states couples to that dipole very strongly.",
  },
  {
    id: "head",
    title: "Metal-free head",
    show: ["head"],
    field: 1.2,
    text: "Two dielectric collimators face each other through the cell, held by three ceramic tie rods. The probe enters at one end and the coupling beam at the other, so they cross the cell in opposite directions; that cancels most of the Doppler shift from the atoms' thermal motion. A dichroic in each collimator separates the probe light leaving the cell into its return fiber.",
  },
  {
    id: "stand",
    title: "Stand",
    show: ["stand"],
    field: 1.2,
    text: "A weighted base, mast and clamp hold the head well above the bench, so reflections from the table and the receiver disturb the field as little as possible. The fibers enter at the bulkhead on the base and run up inside the hollow mast.",
  },
  {
    id: "fiber",
    title: "Fiber link",
    show: ["fiber"],
    field: 1.2,
    text: "A jacketed bundle of single-mode fibers carries the probe and coupling light out to the head and brings the probe light back. Only light travels on it, so unlike a coax cable it picks up no RF and conducts no current to the head.",
  },
  {
    id: "probe",
    title: "Probe laser · 852 nm",
    show: ["probe"],
    open: true,
    field: 1.2,
    text: "A narrow-linewidth diode laser locked to the cesium D2 line, driving 6S → 6P. Its transmission through the cell is the measurement: everything the receiver reports comes from how much probe light gets through.",
  },
  {
    id: "coupling",
    title: "Coupling laser · 510 nm",
    show: ["coupling"],
    open: true,
    field: 1.2,
    text: "A stronger green laser that drives 6P → nD, the Rydberg state. Sweeping its frequency across the resonance traces the spectrum on the screen. The fins on top carry heat away from its thermoelectric cooler, which holds the diode's wavelength steady.",
  },
  {
    id: "launch",
    title: "Fiber launch block",
    show: ["launch"],
    open: true,
    field: 1.2,
    text: "Collimators, isolators and a dichroic mirror that steer each laser into its fiber and keep reflections from feeding back into the diodes. The launcher on its face focuses the light into a fiber core a few micrometres across.",
  },
  {
    id: "photodiode",
    title: "Photodiode",
    show: ["photodiode"],
    open: true,
    field: 1.2,
    text: "Measures the probe light returning from the cell. When the vapor turns transparent the photocurrent rises. This small current is the raw signal the electronics digitise.",
  },
  {
    id: "eit",
    title: "EIT on the screen",
    show: ["screen"],
    sweep: true,
    diagram: "eit",
    text: `With only the probe on, cesium absorbs 852 nm light. Add the coupling laser and at exact resonance the atoms stop absorbing: electromagnetically induced transparency (EIT), the single peak. An RF field on a Rydberg transition splits that peak in two (Autler–Townes). The gap Δ grows in proportion to the field, ${perVm} MHz per V/m here, so the field is read in SI units from atomic constants, with no antenna calibration.`,
  },
  {
    id: "electronics",
    title: "Readout electronics",
    show: ["electronics"],
    open: true,
    field: 2.4,
    text: "Analogue-to-digital converters sample the photodiode. An FPGA keeps both lasers locked, sweeps the coupling laser and fits the two peaks to find Δ and hence the field, many times a second. The shielded can holds the low-noise analogue stages. Results leave through the RF / DATA connector.",
  },
  {
    id: "psu",
    title: "Power supply",
    show: ["psu"],
    open: true,
    field: 1.2,
    text: "Turns the input from the POWER connector into the clean, low-noise rails the laser drivers, coolers and electronics need. It sits under the heat sink, which carries its heat out through the lid.",
  },
  {
    id: "panel",
    title: "Front panel",
    show: ["panel"],
    field: 1.2,
    text: "FIBER goes to the head. RF / DATA carries measurements and control. POWER feeds the unit. The LED shows when both lasers are locked.",
  },
  {
    id: "cover",
    title: "Cover and heat sink",
    show: ["cover"],
    open: true,
    field: 1.2,
    text: "The cover slides back off the chassis for service. Its finned top spreads the heat of the laser coolers and the power supply into the room, which keeps the optics at a steady temperature.",
  },
  {
    id: "clock",
    title: "Atomic clock: same hardware",
    show: ["clock"],
    open: true,
    field: 0,
    lcd: "clock",
    diagram: "loop",
    text: "The second instrument needs no new optics. The oscillator modulates the 852 nm probe laser at 4.596 GHz, so its two sidebands sit 9.193 GHz apart: exactly the splitting of cesium's ground state. When the gap matches, the atoms fall into a dark state and stop absorbing (coherent population trapping). The photodiode sees the cell clear, and the FPGA steers the oscillator to stay on that peak.",
  },
  {
    id: "second",
    title: "10 MHz and 1 PPS outputs",
    show: ["outputs"],
    field: 0,
    lcd: "clock",
    diagram: "cpt",
    text: "That splitting, 9 192 631 770 Hz, defines the SI second. Locked to it, the oscillator becomes an atomic clock with two outputs on the front panel: a 10 MHz reference and a 1 PPS timing pulse, accurate to 1 × 10⁻¹¹, under a microsecond of drift a day. The same cell, probe laser, photodiode and FPGA serve both instruments.",
  },
];

// Opening and closing views: the whole product, closed, with nothing spotlit.
export const OVERVIEW = {
  title: "PhyQ",
  text: "Quantum receiver and atomic clock. Same hardware, same package.",
  end: "The atoms are the antenna and the clock: one cell of cesium, two instruments.",
};

// The clock loop: oscillator → modulated laser → cell → photodiode → FPGA servo → oscillator, with a signal travelling round it.
export const LOOP = `<svg class="rx-diagram" viewBox="0 -2 320 172" role="img" aria-label="Clock loop: the oscillator modulates the probe laser, the light crosses the vapor cell, the photodiode measures it, and the FPGA corrects the oscillator.">
  <path class="rx-dg-out" d="M70 22V6"/><path class="rx-dg-out" d="M66 10L70 4L74 10"/>
  <text class="rx-dg-tag rx-dg-out-t" x="80" y="13">10 MHz · 1 PPS out · 1 × 10⁻¹¹</text>
  <path class="rx-dg-loop" d="M70 40H250V130H70Z"/>
  <g class="rx-dg-box">
    <rect x="18" y="22" width="104" height="36" rx="6"/><rect x="198" y="22" width="104" height="36" rx="6"/>
    <rect x="198" y="112" width="104" height="36" rx="6"/><rect x="18" y="112" width="104" height="36" rx="6"/>
  </g>
  <g class="rx-dg-label rx-dg-center">
    <text x="70" y="38">Oscillator</text><text x="70" y="51" class="rx-dg-note">4.596 GHz</text>
    <text x="250" y="38">Probe laser</text><text x="250" y="51" class="rx-dg-note">modulated</text>
    <text x="250" y="128">Vapor cell</text><text x="250" y="141" class="rx-dg-note">cesium atoms</text>
    <text x="70" y="128">FPGA servo</text><text x="70" y="141" class="rx-dg-note">via photodiode</text>
  </g>
  <circle class="rx-dg-pulse" r="4.5"/>
</svg>`;

// The CPT resonance: transmission against the sideband spacing, peaked at the cesium hyperfine frequency.
export const CPT = `<svg class="rx-diagram" viewBox="0 0 320 174" role="img" aria-label="Coherent population trapping resonance: transmission peaks when the sideband spacing equals 9 192 631 770 hertz, where the clock locks.">
  <g class="rx-dg-axis"><path d="M30 138H300"/><path d="M30 138V20"/></g>
  <path class="rx-dg-curve" d="${Array.from({ length: 161 }, (_, i) => { const x = 30 + (270 * i) / 160; const d = (x - 165) / 9; return `${i ? "L" : "M"}${x.toFixed(1)} ${(132 - 96 / (1 + d * d)).toFixed(1)}`; }).join("")}"/>
  <path class="rx-dg-lock" d="M165 138V26"/>
  <g class="rx-dg-label">
    <text x="165" y="153" text-anchor="middle">9 192 631 770 Hz</text>
    <text x="36" y="28">transmission</text>
    <text x="300" y="168" text-anchor="end" class="rx-dg-note">sideband spacing →</text>
  </g>
  <text class="rx-dg-tag rx-dg-lock-t" x="172" y="40">lock</text>
</svg>`;

// Energy ladder for the Rydberg stop: levels, the two laser steps and the RF step, with an electron that climbs.
export const LADDER = `<svg class="rx-diagram" viewBox="-16 0 336 168" role="img" aria-label="Energy levels of cesium: 852 nanometre probe from 6S to 6P, 510 nanometre coupling from 6P to the Rydberg state nD, and an RF photon between nD and the neighbouring Rydberg state (n+1)P.">
  <g class="rx-dg-level">
    <path d="M40 150H140"/><path d="M40 106H140"/><path d="M40 44H140"/><path d="M150 26H250"/>
  </g>
  <g class="rx-dg-label">
    <text x="146" y="154">6S½  ground</text>
    <text x="146" y="110">6P3/2</text>
    <text x="34" y="48" text-anchor="end">nD5/2</text>
    <text x="256" y="30">(n+1)P3/2</text>
    <text x="34" y="36" text-anchor="end" class="rx-dg-note">Rydberg</text>
  </g>
  <path class="rx-dg-probe" d="M70 148V110"/><path class="rx-dg-probe" d="M66 114L70 108L74 114"/>
  <text class="rx-dg-tag rx-dg-probe-t" x="78" y="132">852 nm probe</text>
  <path class="rx-dg-coupling" d="M70 104V48"/><path class="rx-dg-coupling" d="M66 52L70 46L74 52"/>
  <text class="rx-dg-tag rx-dg-coupling-t" x="78" y="80">510 nm coupling</text>
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
