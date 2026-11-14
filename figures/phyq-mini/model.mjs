// Rydberg electrometry in a rubidium-87 vapor cell, read out by scanning the coupling laser.
// Autler–Townes splitting of the EIT peak: Δ = (λc/λp) · ℘E/h.
const H = 6.62607015e-34; // J·s
const EA0 = 8.4783536e-30; // C·m
const DIPOLE = 1000; // transition dipole in e·a0 (assumed, typical of n ≈ 50 D→P in Rb)
const LAMBDA_P = 780; // nm, Rb D2 probe
const LAMBDA_C = 480; // nm, coupling to the Rydberg D state

const PER_VM = ((LAMBDA_C / LAMBDA_P) * DIPOLE * EA0) / H / 1e6; // MHz per V/m

export const MODEL = {
  dipole: DIPOLE,
  perVm: PER_VM,
  width: 5, // MHz, EIT linewidth (FWHM)
  span: 40, // MHz, the plot shows −span … +span
  maxField: 4, // V/m
};

export function splitOf(field) {
  return field * MODEL.perVm;
}
