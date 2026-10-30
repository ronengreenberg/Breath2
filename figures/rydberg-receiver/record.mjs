// Renders video.html to an MP4, frame by frame on a fake clock, so motion is smooth whatever the machine's speed.
// node record.mjs [out.mp4] [--seconds N] for a short test cut.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const out = args.find((a) => a.endsWith(".mp4")) ?? join(HERE, "phyq-receiver.mp4");
const limit = args.includes("--seconds") ? Number(args[args.indexOf("--seconds") + 1]) : Infinity;

const FPS = 30;
const STEP = 10; // seconds per tour stop, matches window.__STEP in video.html
const INTRO = 5;
const STOPS = 15;
const OUTRO = 7;
const TOTAL = Math.min(limit, INTRO + STOPS * STEP + OUTRO);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
await page.clock.install({ time: 0 });
await page.goto(pathToFileURL(join(HERE, "video.html")).href);
// pause the clock so time only moves when a frame is stepped, not while screenshots are taken
await page.clock.pauseAt(1000);
await page.evaluate(() => {
  window.__tour.showAll();
  // CSS animations and transitions follow the fake clock: each one is paused and set from its own birth time.
  const born = new WeakMap();
  window.__syncAnimations = (now) => {
    for (const a of document.getAnimations()) {
      if (!born.has(a)) born.set(a, now);
      a.pause();
      a.currentTime = now - born.get(a);
    }
  };
});

const ffmpeg = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-vf", "scale=1920:1080:flags=lanczos", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });

const frames = Math.round(TOTAL * FPS);
const events = [
  { at: INTRO - 0.8, run: () => document.getElementById("vid-card").classList.remove("on") },
  { at: INTRO, run: () => window.__tour.play() },
  { at: INTRO + STOPS * STEP - 0.05, run: () => window.__tour.showAll() },
  {
    at: INTRO + STOPS * STEP + 1.2,
    run: () => {
      document.getElementById("vid-sub").textContent = "The atoms are the antenna.";
      document.getElementById("rx-title").textContent = "PhyQ";
      document.getElementById("rx-text").textContent = "A cesium vapor cell for an antenna, two lasers, and a readout that measures field strength from atomic constants.";
      document.getElementById("vid-card").classList.add("on");
    },
  },
];
let next = 0;
for (let f = 0; f < frames; f++) {
  const t = f / FPS;
  while (next < events.length && events[next].at <= t) await page.evaluate(events[next++].run);
  await page.clock.runFor(1000 / FPS);
  await page.evaluate((now) => window.__syncAnimations(now), (f + 1) * (1000 / FPS));
  const jpg = await page.screenshot({ type: "jpeg", quality: 92 });
  if (!ffmpeg.stdin.write(jpg)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
  if (f % (FPS * 10) === 0) console.log(`${t.toFixed(0)} s / ${TOTAL} s`);
}
ffmpeg.stdin.end();
await new Promise((r) => ffmpeg.on("close", r));
await browser.close();
console.log("wrote", out);
