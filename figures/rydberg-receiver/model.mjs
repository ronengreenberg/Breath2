// Rydberg electrometry in a cesium vapor cell, read out by scanning the coupling laser.
// Autler–Townes splitting of the EIT peak: Δ = (λc/λp) · ℘E/h.
const H = 6.62607015e-34; // J·s
const EA0 = 8.4783536e-30; // C·m
const DIPOLE = 1000; // transition dipole in e·a0 (assumed, typical of n ≈ 45–50 D→P in Cs)
const LAMBDA_P = 852; // nm, Cs D2 probe
const LAMBDA_C = 510; // nm, coupling to the Rydberg D state

const PER_VM = ((LAMBDA_C / LAMBDA_P) * DIPOLE * EA0) / H / 1e6; // MHz per V/m

export const MODEL = {
  dipole: DIPOLE,
  perVm: PER_VM,
  width: 5, // MHz, EIT linewidth (FWHM) in the coupling scan
  span: 40, // MHz, the screen shows −span … +span
  maxField: 4, // V/m
  // screen window in face coordinates (x, z) on the front panel
  x0: -107.5,
  x1: -44.5,
  zBase: 14.6,
  zPeak: 22.4,
};

export function splitOf(field) {
  return field * MODEL.perVm;
}

// Probe transmission against coupling detuning: two Lorentzians of half height, Δ apart,
// which merge into the single EIT peak when the field is zero. A fixed ripple stands for detector noise.
export function traceOf(field) {
  const { x0, x1, zBase, zPeak, span, width, perVm } = MODEL;
  const half = (field * perVm) / 2;
  const g = width / 2;
  const lorentz = (d) => (g * g) / (d * d + g * g);
  const points = [];
  const count = 120;
  for (let i = 0; i <= count; i++) {
    const d = -span + (2 * span * i) / count;
    const signal = 0.5 * (lorentz(d - half) + lorentz(d + half));
    const ripple = 0.025 * Math.sin(i * 1.7) + 0.018 * Math.sin(i * 4.3 + 1);
    const x = x0 + ((x1 - x0) * i) / count;
    const z = zBase + (zPeak - zBase) * (signal + ripple + 0.04);
    points.push(`${i ? "L" : "M"}${x.toFixed(2)} ${(-z).toFixed(2)}`);
  }
  return points.join("");
}
