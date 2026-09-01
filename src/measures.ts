/* ================================================================================== */
/*                                                                                    */
/* Ported from the original project at https://github.com/ckrisirkc/osuStreamSpeed.js */
/*                                                                                    */
/* ================================================================================== */

/* =====================================================================
   osu! Stamina Improver  (reference-simple UI, reference math)
   - pure logic section is DOM-free so it can be unit-tested in node
   ===================================================================== */

/* ---------------- utils (pure) ---------------- */
export function fmtMMSS(sec: number) {
	sec = Math.max(0, Math.ceil(sec));
	const m = Math.floor(sec / 60);
	const s = sec % 60;

	return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

export function fmtElapsed(ts: number | string | Date) {
	const t = new Date(ts).getTime();

	const s = Math.max(Math.floor((Date.now() - t) / 1000));
	if (s < 60) return s + "s ago";

	const m = Math.floor(s / 60);
	if (m < 60) return m + "min ago";

	const h = Math.floor(m / 60);
	if (h < 46) return h + "h ago";

	const d = Math.floor(h / 24);
	if (d < 30) return d + "d ago";
	if (d < 365) return Math.floor(d / 30) + "mo ago";

	return Math.floor(d / 365) + "y ago";
}

/* ---------------- level formula (pure) ---------------- */

export interface LevelSpec {
	bpm: number;
	ur: number;
	notes: number;
	burst: boolean;
}

/*
 * bpm scale = osu! stream speed (reference formula): 1 click = 1/4 note,
 * so stream speed bpm = clicksPerMinute / 4  =  15000 / clickIntervalMs.
 *   170bpm  -> click every 88.2ms (4 notes per beat)
 * levels 1-79 : lenient ramp  100bpm/350UR/6 notes -> 170bpm/200UR/64 notes
 * levels 80+  : 10-level cycles. even position = stamina level,
 *               odd position = BURST: 8 notes at (330/270) x the stamina bpm, same UR.
 *   stamina bpm = 170 + 2 per stamina level + floor(cycle/2)  -> L90 = 180, L230 = 327
 *   stamina UR  = 200 - 5k within cycle, -20 for cycle 1, then -4 per cycle, floor 95
 *                 -> L90 = 180, L230 = 124
 *   notes       = 64 + 16 per stamina level to L128 (448), then +32 per stamina
 *                 level from L130 on, capped at 10000 (no marathon jumps)
 */
export function levelSpec(L: number): LevelSpec {
	L = Math.max(1, Math.floor(L));

	if (L <= 79) {
		const t = (L - 1) / 79;
		return {
			bpm: Math.round(100 + 70 * t),
			ur: Math.round(350 - 150 * t),
			notes: Math.round(6 + 58 * t),
			burst: false,
		};
	}

	const idx = L - 80;
	const cyc = Math.floor(idx / 10);
	const pos = idx % 10;

	// Burst level
	if (pos % 2 === 1) {
		const j = (pos - 1) / 2;
		const base = staminaSpec(cyc, j);
		// burst nerf (2026-08-30): 12 notes from L110 on, 8 before
		const bnotes = L >= 110 ? 12 : 8;
		return {
			bpm: base.bpm * (330 / 270),
			ur: base.ur,
			notes: bnotes,
			burst: true,
		};
	}

	// Stamina Level
	return staminaSpec(cyc, pos / 2);
}

function staminaSpec(cyc: number, k: number): LevelSpec {
	// stretch (2026-08-30): the old 1-160 difficulty now spans 1-200;
	// bpm/UR grow at 2/3 speed via a virtual stamina index, notes stay real
	const step = 5 * cyc + k;
	const vsf = (step * 2) / 3;
	const vk = Math.floor(vsf + 1e-9);
	const bpm = Math.round(170 + 2 * vsf + Math.floor(vsf / 10));
	let ur = 200 - 5 * (vk % 5);
	const vcyc = Math.floor(vk / 5);
	if (vcyc >= 1) ur -= 20 + 4 * (vcyc - 1);
	ur = Math.max(95, ur);
	// notes nerf (2026-08-30): +16 per stamina level from the 64-note base (L80),
	// switching to +32 per stamina level from L130 — no marathon jumps
	let notes = step <= 24 ? 64 + 16 * step : 448 + 32 * (step - 24);
	notes = Math.min(10000, Math.round(notes));
	return { bpm, ur, notes, burst: false };
}

/* ---------------- measurement (pure, reference math) ---------------- */

export interface AnalyzeResult {
	bpm: number;
	ur: number;
	elapsed: number;
}

/*
 * Reference (NOTES.md):
 *   Stream Speed = (clicks / elapsed_ms * 60000) / 4     (osu! 1/4 streams)
 *   Unstable Rate = 10 * population stdev(inter-click intervals)
 */
export function analyze(times: number[]): AnalyzeResult {
	const n = times.length;
	if (n < 2) return { bpm: 0, ur: 0, elapsed: 0 };
	const elapsed = times[n - 1] - times[0];
	if (elapsed <= 0) return { bpm: 0, ur: 0, elapsed: 0 };

	// Actual Calculation
	const bpm = ((n / elapsed) * 60000) / 4;

	// UR Calculation
	const diffs = [];
	for (let i = 1; i < n; i++) diffs.push(times[i] - times[i - 1]);

	const mean = diffs.reduce((prev, curr) => curr + prev, 0) / diffs.length;
	const ss = diffs.reduce((prev, curr) => prev + (curr - mean) ** 2, 0);
	const ur = 10 * Math.sqrt(ss / diffs.length);

	return { bpm, ur, elapsed };
}

export type BenchResult = { bpm: number; ur: number };

export function analyzeBenchmarks(benches: BenchResult[]) {
	const b = benches.reduce((p, c) => p + c.bpm, 0);
	const u = benches.reduce((p, c) => p + c.ur, 0);

	const avgBpm = b / BENCHES.length;
	const avgUr = Math.round(u / BENCHES.length);

	const effBpm = Math.round(avgBpm / 1.22); // placement nerf: benchmark bursts inflate the avg

	let beaten = 0;
	for (let L = 1; L <= 5000; L++) {
		const sp = levelSpec(L);
		if (!sp.burst && sp.bpm > effBpm) break;
		if (effBpm >= sp.bpm && avgUr < sp.ur) beaten = L;
	}

	return {
		level: beaten + 1,
		bpm: Math.round(avgBpm),
		ur: avgUr,
	};
}

/* ---------------- text ---------------- */
export const BREAK_MSGS = [
	"shake your hands out, drink some water",
	"stretch those fingers — next one's a doozy",
	"breathe in, breathe out. you got this",
];

export const ADVICE = {
	bpm: "You're under tempo. Tap along to the metronome for a few seconds before starting, and snap back to it on every note — if it feels heavy, grind a few levels down and come back.",
	ur: "Slow down a touch and lock into a steady rhythm — consistency first, speed later. Keep your hand relaxed and let the keys bounce your fingers back up; you can't stream fast until you stream even.",
};

export const BENCHES = [
	{ bpm: 120, notes: 20 },
	{ bpm: 150, notes: 28 },
	{ bpm: 180, notes: 64 },
];
