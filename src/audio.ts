/* ================================================================================== */
/*                                                                                    */
/* Ported from the original project at https://github.com/ckrisirkc/osuStreamSpeed.js */
/*                                                                                    */
/* ================================================================================== */

/* ---------------- audio (accurate metronome with osu! hitwhistle sounds) ---------------- */
/* osu! hit sounds (drop the .ogg files next to index.html).
   preferred: drum-hitnormal.ogg (soft) — falls back to soft-hitwhistle3.ogg,
   then drum-hitwhistle.ogg, then a quiet beep. */
const SND_ORDER = [
	"drum-hitnormal.ogg",
	"soft-hitwhistle3.ogg",
	"drum-hitwhistle.ogg",
];

let ctx: AudioContext | null = null;

function ensureAudio() {
	if (!ctx) ctx = new window.AudioContext();
	if (ctx.state === "suspended") ctx.resume();
	return ctx;
}

let sndBest: string | null = null;

function probeSound(src: string, okFn: (ok: boolean) => void) {
	try {
		const a = new Audio(src);
		a.preload = "auto";
		a.addEventListener("canplaythrough", () => okFn(true), { once: true });
		a.addEventListener("error", () => okFn(false), { once: true });
	} catch (e) {
		console.error(e);
		okFn(false);
	}
}

export function initSounds() {
	let done = false;
	SND_ORDER.forEach((src) =>
		probeSound(src, (ok) => {
			if (ok && !done) {
				sndBest = src;
				done = true;
			}
		}),
	);
}
function playAudio(src: string, vol: number) {
	const a = new Audio(src);
	a.volume = vol;
	const p = a.play();
	if (p && p.catch) p.catch(console.error);
}

export function playTickSound() {
	if (sndBest) playAudio(sndBest, 0.22);
}

function playBeatSound() {
	if (sndBest) playAudio(sndBest, 0.4);
}

const metro = {
	enabled: true,
	timer: 0,
	next: 0,
	interval: 0,
	tickCount: 0,
	LOOKAHEAD: 0.12,
};

/* ticks at exactly the 1/4-note rate of the target bpm: interval = 15000/bpm ms,
   accent (drum) on the first tick of every 4 (one beat) */
export function metroStart(bpm: number) {
	metroStop();
	if (!metro.enabled) return;

	console.log(sndBest);

	ensureAudio();
	metro.interval = 15000 / bpm / 1000; // seconds per click
	metro.next = ctx!.currentTime + 0.1;
	metro.tickCount = 0;
	metro.timer = setInterval(metroTick, 25);
}

function metroTick() {
	while (metro.next < ctx!.currentTime + metro.LOOKAHEAD) {
		metro.tickCount++;
		if (metro.tickCount % 4 === 1) playBeatSound();
		else playTickSound();
		metro.next += metro.interval;
	}
}

export function metroStop() {
	if (metro.timer) {
		clearInterval(metro.timer);
		metro.timer = 0;
	}
}
