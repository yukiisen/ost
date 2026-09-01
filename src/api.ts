import type { AnalyzeResult, LevelSpec } from "./measures";
import { Config } from "./pallette";

const API_BASE = "https://osu-stamina-improver.pages.dev";
const config = new Config();

export interface RunInfo {
	spec: LevelSpec;
	result: AnalyzeResult;
	clicks: number[];
	level: number;
}

export async function submitRun({ spec, result, clicks, level }: RunInfo) {
	const username = config.get("username");
	if (!username) return false;

	const payload = {
		name: username,
		level: level,
		notes: spec.notes,
		bpm: result.bpm,
		ur: result.ur,
		elapsedMs: result.elapsed,
		proof: { clicks: clicks },
	};

	try {
		const res = await fetch(API_BASE + "/api/submit", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (!res.ok) {
			console.log(res.statusText, res.json());
			return false;
		}

		return true;
	} catch (err) {
		console.error(err);
		return false;
	}
}

export async function submitTaps({ result, clicks }: RunInfo) {
	const username = config.get("username");
	if (!username) return false;

	const payload = {
		name: username,
		notes: clicks.length,
		bpm: result.bpm,
		ur: result.ur,
		elapsedMs: result.elapsed,
		proof: { clicks: clicks },
	};

	try {
		const res = await fetch(API_BASE + "/api/taps", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (!res.ok) {
			console.log(res.statusText, res.json());
			return false;
		}

		return true;
	} catch (err) {
		console.error(err);
		return false;
	}
}

export interface LeaderboardScore {
	name: string;
	level: number;
	totalTaps: number;
	bestAt?: string;
	lastSeen?: string;
	bpm: number;
	ur: number;
}

type Leaderboard = { leaderboard: LeaderboardScore[] };

export async function fetchLeaderboard(): Promise<LeaderboardScore[]> {
	const res = await fetch(API_BASE + "/api/leaderboard?limit=50");
	if (!res.ok) throw new Error("Fuck");

	const lb = (await res.json()) as Leaderboard;

	return lb.leaderboard;
}
