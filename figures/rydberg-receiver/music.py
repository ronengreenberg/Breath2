# Background music for the PhyQ video: a calm, original ambient-tech piece synthesised from scratch.
# python3 music.py out.wav [seconds]
import sys, wave
import numpy as np

SR = 44100
OUT = sys.argv[1] if len(sys.argv) > 1 else "music.wav"
DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 170.0
BPM = 100
BEAT = 60 / BPM
BAR = 4 * BEAT
N = int(DUR * SR)
t_all = np.arange(N) / SR
rng = np.random.default_rng(7)


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def lowpass(x, cutoff):
    # one-pole magnitude response applied in the frequency domain (zero phase)
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(spec / np.sqrt(1 + (f / cutoff) ** 2), len(x))


# Chord progression (A minor, open voicings): Am9 · Fmaj7 · C(add9) · G6, two bars each.
CHORDS = [
    [45, 57, 60, 64, 67, 71],
    [41, 57, 60, 64, 65, 69],
    [48, 55, 60, 62, 64, 67],
    [43, 55, 59, 62, 64, 67],
]
CHORD_LEN = 2 * BAR


def chord_at(time):
    return CHORDS[int(time // CHORD_LEN) % len(CHORDS)]


def env_ar(n, attack, release):
    e = np.ones(n)
    a = int(attack * SR); r = int(release * SR)
    if a: e[:a] = np.linspace(0, 1, a)
    if r: e[-r:] *= np.linspace(1, 0, r)
    return e


mix = np.zeros(N)

# Pad: detuned saw stack per chord, crossfaded, gently filtered.
pad = np.zeros(N)
cl = int(CHORD_LEN * SR)
fade = int(1.2 * SR)
for start in range(0, N, cl):
    chord = chord_at(start / SR)
    n = min(cl + fade, N - start)
    t = np.arange(n) / SR
    seg = np.zeros(n)
    for note in chord[1:]:
        for det in (-0.08, 0.0, 0.07):
            f = hz(note + det)
            ph = rng.random()
            seg += 2 * ((f * t + ph) % 1) - 1
    seg *= env_ar(n, 1.2, 1.2)
    pad[start:start + n] += seg
pad = lowpass(lowpass(pad, 900), 1400)
pad *= 0.6 + 0.4 * np.sin(2 * np.pi * t_all / (CHORD_LEN * 2)) ** 2  # slow swell
mix += 0.035 * pad

# Sub bass: soft sine on the chord root, one note per half bar.
bass = np.zeros(N)
step = BAR / 2
for k in range(int(DUR / step)):
    s = int(k * step * SR); n = min(int(step * SR), N - s)
    if n <= 0: break
    t = np.arange(n) / SR
    f = hz(chord_at(k * step)[0] - 12 + 12)
    bass[s:s + n] += np.sin(2 * np.pi * f * t) * env_ar(n, 0.02, step * 0.5) * np.exp(-t * 0.8)
mix += 0.16 * bass

# Arpeggio: bell-like plucks in eighth notes, climbing through the chord, with a dotted-eighth echo.
arp = np.zeros(N)
pattern = [1, 3, 2, 4, 3, 5, 4, 2]
eighth = BEAT / 2
for k in range(int(DUR / eighth)):
    time = k * eighth
    chord = chord_at(time)
    note = chord[1 + (pattern[k % 8] - 1) % (len(chord) - 1)] + 12
    s = int(time * SR); n = min(int(1.2 * SR), N - s)
    if n <= 0: break
    t = np.arange(n) / SR
    f = hz(note)
    tone = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 9)
    accent = 1.0 if k % 2 == 0 else 0.7
    arp[s:s + n] += tone * np.exp(-t * 5) * env_ar(n, 0.003, 0.05) * accent
d = int(BEAT * 0.75 * SR)
echo = np.zeros(N)
for i, g in enumerate((0.45, 0.22, 0.1), start=1):
    echo[d * i:] += g * arp[:N - d * i]
arp = arp + echo
mix += 0.05 * arp * np.clip((t_all - 3) / 6, 0, 1)  # arpeggio enters after the first seconds

# Pulse: soft kick on beats 1 and 3 and a quiet tick on the offbeats, entering after the intro.
perc = np.zeros(N)
for k in range(int(DUR / BEAT)):
    s = int(k * BEAT * SR)
    if k % 2 == 0:
        n = min(int(0.35 * SR), N - s)
        t = np.arange(n) / SR
        f = 50 + 70 * np.exp(-t * 30)
        perc[s:s + n] += np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 10)
    s2 = int((k + 0.5) * BEAT * SR); n = min(int(0.05 * SR), N - s2)
    if n > 0:
        noise = rng.standard_normal(n)
        noise = noise - lowpass(noise, 6000)
        perc[s2:s2 + n] += 0.25 * noise * np.exp(-np.arange(n) / SR * 80)
mix += 0.18 * perc * np.clip((t_all - 8) / 4, 0, 1) * np.clip((DUR - 8 - t_all) / 4, 0, 1)

# Reverb: convolution with a decaying noise tail.
ir_len = int(2.6 * SR)
ir = rng.standard_normal(ir_len) * np.exp(-np.arange(ir_len) / SR * 2.6)
ir = lowpass(ir, 4000); ir /= np.sqrt(np.sum(ir ** 2))
size = 1 << int(np.ceil(np.log2(N + ir_len)))
wet = np.fft.irfft(np.fft.rfft(mix, size) * np.fft.rfft(ir, size), size)[:N]
out = 0.8 * mix + 0.35 * wet

# Fades and level.
out *= np.clip(t_all / 3, 0, 1) * np.clip((DUR - t_all) / 5, 0, 1)
out /= np.max(np.abs(out)) / 0.7
stereo = np.stack([out, np.roll(out, int(0.012 * SR))], axis=1)  # slight width
pcm = (stereo * 32767).astype("<i2")
with wave.open(OUT, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", OUT, f"{DUR:.1f} s")
