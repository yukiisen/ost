import "./styles/main.css";

import { attachOn, Config, reload } from "./pallette";
import { $, Init } from "./dom";
import { Range, Toggle } from "./components";
import { initSounds, metroStart, metroStop, playTickSound } from "./audio";
import {
	analyze,
	levelSpec,
	ADVICE,
	BENCHES,
	type AnalyzeResult,
	type BenchResult,
	type LevelSpec,
	analyzeBenchmarks,
	fmtElapsed,
} from "./measures";
import {
	fetchLeaderboard,
	submitRun,
	submitTaps,
	type LeaderboardScore,
	type RunInfo,
} from "./api";

$.ready(main);

/* ============ */
/* Global State */
/* ============ */

const config = new Config();

type GameStatus = "idle" | "ready" | "playing" | "fail" | "win";
type GameMode = "level" | "bench";

/*
 *   Lifetime Notes:
 *   breakTimeout is reset pre-level start
 *   level/spec is reset at level loading
 *   times/count is reset at level loading
 *   startTime is reset at first click
 * */
const state = {
	status: "idle" as GameStatus,
	mode: "level" as GameMode,

	breakTimeout: null as number | null,

	level: 1,
	spec: {} as LevelSpec,

	benchIdx: 0,
	benchResults: [] as BenchResult[],

	times: [] as number[],
	startTime: 0,
	count: 0,
};

/* =========== */
/* Entry Point */
/* =========== */

async function main() {
	attachOn($("#picker"));
	reload();

	$("#pick-trigger").on("click", () => $("#picker").elem.click());

	$.all(".range").forEach((init) => Range.init(init));
	$.all(".toggle").forEach((init) => Toggle.init(init));

	const [input1, input2] = [$("#key1"), $("#key2")];

	initInput(input1, "Z");
	initInput(input2, "X");

	const keys = config.get<[string, string]>("keys") ?? ["Z", "X"];

	$("#btn1").content = input1.value = keys[0];
	$("#btn2").content = input2.value = keys[1];

	initSounds();

	const blur = config.get<number>("bgblur") ?? 0.4;
	const dim = config.get<number>("bgdim") ?? 70;

	Range.setValue($("#bg-dim"), dim);
	Range.setValue($("#bg-blur"), blur * 100);

	$("#bg-dim").localOn("change", (self) => {
		const value = Range.value(self);
		$(":root").setProperty("--wall-brightness", `${100 - value}%`);
		config.set("bgdim", value);
	});

	$("#bg-blur").localOn("change", (self) => {
		const value = Range.value(self);
		$(":root").setProperty("--wall-blur", `${value / 100}rem`);
		config.set("bgblur", value / 100);
	});

	const mousebtns = config.get<boolean>("mousebtn") ?? false;
	const metronome = config.get<boolean>("metronome") ?? false;

	Toggle.setValue($("#metronome"), metronome);
	Toggle.setValue($("#mousebtn"), mousebtns);

	$("#mousebtn").localOn("change", (self) => {
		config.set("mousebtn", Toggle.value(self));
	});

	$("#metronome").localOn("change", (self) => {
		config.set("metronome", Toggle.value(self));
	});

	$("#username").content = config.get("username") ?? "Guest";
	$("#level").content = config.get("level") ?? "1";

	$("#home").display(true);
	$("#gameplay").display(false);
	$("#advice").display(false);

	loadLevel();
	loadLeaderboard();

	const run = config.get<RunInfo>("lastrun");
	if (run) {
		if (await submitRun(run)) config.remove("lastrun");
	}

	$("#reset").on("click", () => {
		if (!confirm("Are you very very sure???")) return;
		config.set("level", 1);
		loadLevel();
	});

	$("#start").on("click", () => {
		$("#home").display(false);
		$("#gameplay").display(true);
		goHash("gameplay");

		state.status = "ready";
		state.mode = "level";
		loadLevel();
	});

	$("#findlevel").on("click", () => {
		$("#home").display(false);
		$("#gameplay").display(true);
		goHash("gameplay");

		state.status = "ready";
		state.mode = "bench";

		state.benchIdx = 0;
		state.benchResults = [];

		loadLevel();
	});

	$("#menu").on("click", () => {
		$("#home").display(true);
		$("#gameplay").display(false);
		goHash("home");

		state.status = "idle";
		loadLevel();
	});

	$("#action").on("click", action);

	$.root.on("keydown", keydown);
	$.root.on("keyup", keyup);

	$.root.on("mousedown", (ev) => {
		if (!config.get("mousebtn")) return;

		const keys = config.get<[string, string]>("keys") ?? ["Z", "X"];
		const e = new KeyboardEvent("keydown", {
			repeat: false,
			key: ev.button == 0 ? keys[0] : keys[1],
		});
		keydown(e);

		if (e.defaultPrevented) ev.preventDefault();
	});

	$.root.on(
		"mousedown",
		(ev) => {
			if (!config.get("mousebtn")) return;

			const keys = config.get<[string, string]>("keys") ?? ["Z", "X"];
			const e = new KeyboardEvent("keyup", {
				repeat: false,
				key: ev.button == 0 ? keys[0] : keys[1],
			});
			keyup(e);

			if (e.defaultPrevented) ev.preventDefault();
		},
		{ passive: false },
	);

	$.root.on("contextmenu", (ev) =>
		config.get("mousebtn") ? ev.preventDefault() : void 0,
	);

	$("#rename").on("click", () => {
		const name = prompt("Enter your username (max 16 chars)");
		if (!name) return;

		config.set("username", name);
		$("#username").content = name;
		loadLeaderboard();
	});

	$("#refresh").on("click", loadLeaderboard);
}

/* ========== */
/* Game Logic */
/* ========== */

async function press() {
	if (state.status == "ready") {
		state.status = "playing";
		state.startTime = performance.now();
		state.times.push(0);
		state.count++;

		$("#np").setProp("visibility", "visible");
		showResult(analyze(state.times));
		if (state.mode == "bench") playTickSound();
		return;
	}

	state.count++;

	const now = performance.now();
	state.times.push(now - state.startTime);

	if (state.mode == "bench") playTickSound();
	showResult(analyze(state.times));
	if (state.count >= state.spec.notes) await finishRun();
}

async function finishRun() {
	$("#np").setProp("visibility", "hidden");

	const result = analyze(state.times);

	if (state.mode == "bench") {
		state.benchResults.push({ bpm: result.bpm, ur: result.ur });
		state.benchIdx++;
		state.status = "win";

		if (state.benchIdx == BENCHES.length) {
			state.mode = "level";

			const res = analyzeBenchmarks(state.benchResults);
			config.set("level", res.level);
			$("#action").content = "Next Level →";

			return setStatus(
				`Avg ${res.bpm}BPM/${res.ur}UR, reaching Lv.${res.level}`,
			);
		}

		const breakTime = Math.max(result.elapsed / 6000, 1000);
		state.breakTimeout = setTimeout(action, breakTime);
		return;
	}

	const pass = result.bpm >= state.spec.bpm && result.ur <= state.spec.ur;

	metroStop();

	if (pass) {
		setStatus(`Level ${state.level} cleared!`, "clear");

		config.set("level", ++state.level);

		if (!(await submitRun({ result: result, clicks: state.times, ...state }))) {
			config.set("lastrun", {
				clicks: state.times,
				spec: state.spec,
				level: state.level - 1,
				result,
			});
		} else {
			loadLeaderboard();
		}

		state.status = "win";

		$("#action").content = "Next Level →";

		const breakTime = Math.max(result.elapsed / 6000, 1000);
		state.breakTimeout = setTimeout(action, breakTime);

		return;
	}

	state.status = "fail";
	$("#action").content = "Retry";
	setStatus(`Level ${state.level} failed!`, "fail");

	const advice = result.bpm < state.spec.bpm ? ADVICE.bpm : ADVICE.ur;
	$("#advice").display(true).content = advice;

	if (!config.get("username")) $("#rename").elem.click();
	await submitTaps({ result, clicks: state.times } as RunInfo);
}

function loadLevel() {
	// Cleanup
	$("#bpm").content = "--";
	$("#ur").content = "--";
	$("#npi").setProperty("width", `0%`);

	$("#btn1").elem.classList.remove("pressed");
	$("#btn2").elem.classList.remove("pressed");

	setStatus("Time starts at your first click!");
	$("#advice").display(false);

	$("#bpm").elem.classList.remove("fail");
	$("#ur").elem.classList.remove("fail");

	// level loading.
	const level = config.get<number>("level") ?? 1;
	const spec = levelSpec(level);

	state.level = level;
	state.spec = spec;
	state.times = [];
	state.count = 0;

	if (state.mode == "level") {
		$(".leveln label").content = String(level);
		$("#bpm-spec").content = String(spec.bpm);
		$("#ur-spec").content = String(spec.ur);
		$("#notes-spec").content = String(spec.notes);
		$("#burst-spec").display(spec.burst);
	} else {
		state.spec = {
			bpm: 0,
			ur: 100000,
			notes: BENCHES[state.benchIdx].notes,
			burst: false,
		};

		$(".benchn label").content = String(state.benchIdx + 1);
		$(".benchinfo label").content = String(state.spec.notes);
	}

	$("#level").content = String(level);

	$("#action").content = "Retry";

	$(".leveln").display(state.mode == "level");
	$(".levelinfo").display(state.mode == "level" ? "block" : false);
	$(".benchn").display(state.mode == "bench");
	$(".benchinfo").display(state.mode == "bench" ? "block" : false);

	if (state.status == "idle") metroStop();
	else if (config.get<boolean>("metronome") && state.mode == "level")
		metroStart(spec.bpm);
}

/* ============== */
/* Input Handlers */
/* ============== */

async function action() {
	switch (state.status) {
		case "win":
			if (state.breakTimeout) {
				clearTimeout(state.breakTimeout);
				state.breakTimeout = null;
			}

			state.status = "ready";
			loadLevel();
			break;
		case "fail":
			state.status = "ready";
			loadLevel();
			break;
		case "ready":
		case "playing":
			if (state.times.length > 2)
				await submitTaps({
					result: analyze(state.times),
					clicks: state.times,
				} as RunInfo);
			loadLevel();
			break;
	}
}

async function keydown(ev: KeyboardEvent) {
	if (ev.repeat) return;

	if (ev.key == "Enter")
		return $(state.status == "idle" ? "#start" : "#action").elem.click();
	if (ev.key == "Escape") return $("#menu").elem.click();
	if (state.status != "playing" && state.status != "ready") return;

	const keys = config.get<[string, string]>("keys") ?? ["Z", "X"];

	if (keys.includes(ev.key.toUpperCase())) {
		ev.preventDefault();
		const idx = keys.findIndex((v) => v == ev.key.toUpperCase());
		$("#btn" + (idx + 1)).elem.classList.add("pressed");
		await press();
	} else if (ev.key == " ") ev.preventDefault();
}

function keyup(ev: KeyboardEvent) {
	if (state.status != "playing" && state.status != "ready") return;

	const keys = config.get<[string, string]>("keys") ?? ["Z", "X"];
	const idx = keys.findIndex((v) => v == ev.key.toUpperCase());
	if (idx == -1) return;

	ev.preventDefault();
	$("#btn" + (idx + 1)).elem.classList.remove("pressed");
}

/* ================ */
/* DOM Manipulation */
/* ================ */

function setStatus(text: string, state?: string) {
	$("#note").content = text;
	$("#note").elem.className = state || "";
}

function showResult(res: AnalyzeResult) {
	$("#bpm").content = String(res.bpm);

	if (res.bpm < state.spec.bpm) $("#bpm").elem.classList.add("fail");
	else $("#bpm").elem.classList.remove("fail");

	$("#ur").content = String(res.ur);

	if (res.ur > state.spec.ur) $("#ur").elem.classList.add("fail");
	else $("#ur").elem.classList.remove("fail");

	$("#npi").setProperty("width", `${(state.count / state.spec.notes) * 100}%`);

	setStatus(`Notes ${state.count}/${state.spec.notes}`);
}

function initInput(input: Init, value: string) {
	input.on("input", () => {
		input.value = (input.value[input.value.length - 1] || value).toUpperCase();

		const keys = config.get<[string, string]>("keys") ?? ["Z", "X"];
		keys[value == "Z" ? 0 : 1] = input.value;
		config.set("keys", keys);

		$("#btn1").content = keys[0];
		$("#btn2").content = keys[1];
	});
}

function goHash(hash: string) {
	location.hash = "";
	location.hash = hash;
}

function LbStatus(text: string) {
	$("#status-row").display("contents").child("td")!.content = text;
}

async function loadLeaderboard() {
	LbStatus("Loading Leaderboard...");
	$.all("#lbbody tr:not(#status-row)").forEach((ini) => ini.elem.remove());

	try {
		const scores = await fetchLeaderboard();
		if (scores.length == 0)
			return LbStatus("No Scores Found, try submitting one yourself!");

		$("#status-row").display(false);
		for (const [rank, score] of scores.entries()) renderScore(rank + 1, score);
	} catch (e) {
		console.error(e);
		LbStatus("Leaderboard Unreachable (offline?)");
	}
}

function td(content: string) {
	const td = $(document.createElement("td"));
	td.content = content;
	return td;
}

function renderScore(rank: number, score: LeaderboardScore) {
	const row = $(document.createElement("tr"));
	row.append(td(String(rank)));
	row.append(td(String(score.name)));
	row.append(td(String(score.level)));
	row.append(td(String(Math.round(score.bpm))));
	row.append(td(String(Math.round(score.ur))));
	row.append(td(String(score.totalTaps)));

	const submitted = td(
		fmtElapsed(score.bestAt || score.lastSeen || Date.now()),
	);
	submitted.elem.title = new Date(
		score.bestAt || score.lastSeen || Date.now(),
	).toLocaleString();

	row.append(submitted);

	const username = config.get("username");
	if (username == score.name) row.elem.classList.add("me");

	$("#lbbody").append(row);
}
