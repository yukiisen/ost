import { $, Init } from "./dom";

type RGBColor = [number, number, number];

interface ColorPallette {
	main: RGBColor;
	softMain: RGBColor;
	light: RGBColor;
	softLight: RGBColor;
	dark: RGBColor;
	softDark: RGBColor;
	darkHover: RGBColor;
	accent: RGBColor;
	accentHover: RGBColor;
	secondary: RGBColor;
	borders: RGBColor;
	text: RGBColor;
}

const defaultPallette: ColorPallette = {
	accent: [140, 80, 50],
	dark: [60, 20, 10],
	light: [220, 170, 120],
	text: [255, 255, 255],
	borders: [122, 44.6, 43.4],
	accentHover: [143, 85.9, 51.1],
	softDark: [72, 43.599999999999994, 14.4],
	softLight: [205, 140.5, 114.5],
	darkHover: [61.5, 22.95, 10.55],
	main: [60, 20, 10],
	softMain: [72, 43.599999999999994, 14.4],
	secondary: [81, 61.3, 17.7],
};

// helpers
const COLOR_ADJUST = 10;
const BLACK_RGB = [0, 0, 0] as RGBColor;
const WHITE_RGB = [255, 255, 255] as RGBColor;
const SIZE_MB = (n: number) => 1024 * 1024 * n;

// Saves/Restores theme config.
export class Config {
	get wallpaper(): string | null {
		return this.get("wallpaper");
	}

	set wallpaper(v: string) {
		this.set("wallpaper", v);
	}

	get pallette(): ColorPallette {
		return this.get<ColorPallette>("pallette") ?? defaultPallette;
	}

	set pallette(v: ColorPallette) {
		this.set("pallette", v);
	}

	set(key: string, val: any) {
		window.localStorage.setItem("OST_" + key, JSON.stringify(val));
	}
	get<T = string>(key: string) {
		return JSON.parse(
			window.localStorage.getItem("OST_" + key) ?? "null",
		) as T | null;
	}

	remove(key: string) {
		window.localStorage.removeItem("OST_" + key);
	}
}

const config = new Config();

export function attachOn(el: Init) {
	el.on("change", async (_) => {
		const file = (el.elem as HTMLInputElement).files?.[0];

		if (!file) return;
		if (file.size > SIZE_MB(4)) return alert("Hell man!");
		console.log("Processing File..");

		try {
			const image: string = (await readFile(file)) as string;

			const pixels = await getImagePixels(image);
			const colors = getColors(pixels);

			$("#wallpaper").setProp("backgroundImage", `url("${image}")`);

			config.wallpaper = image;
			config.pallette = colors;

			applyColorScheme(colors);
		} catch (err) {
			console.error(err);
			alert("An Error Has Happened!!!!!");
		}
	});
}

export function reload() {
	$("#wallpaper").setProp(
		"backgroundImage",
		`url("${config.wallpaper || "/wallpaper.jpg"}")`,
	);
	applyColorScheme(config.pallette);

	const blur = config.get("bgblur") ?? 0.4;
	const dim = config.get("bgdim") ?? 70;

	$(":root").setProperty("--wall-brightness", `${dim}%`);
	$(":root").setProperty("--wall-blur", `${blur}rem`);
}

function getColors(pixels: ArrayLike<number>): ColorPallette {
	// NOTE: try benchamarking a Map here
	const colors: Record<string, number> = {};
	const pallette = {} as ColorPallette;

	for (let i = 0; i < pixels.length; i += 4) {
		const color = [pixels[i], pixels[i + 1], pixels[i + 2]].map(
			(b) => Math.floor(b / COLOR_ADJUST) * COLOR_ADJUST,
		);
		const name = color.join(",");

		colors[name] ??= 0;
		colors[name] += 1;
	}

	// From a legacy codebase, might need improvement.
	const colorsList = Object.entries(colors)
		.filter(([, o]) => o >= (pixels.length / 4) * (0.5 / 100)) // keep only most used colors
		.sort((a, b) => a[1] - b[1]) // sort based on occurences
		.map(([e]) => e.split(",").map((e) => +e)) as RGBColor[]; // keep the colors only

	for (const color of colorsList) {
		if (isDark(color) && !pallette.dark) {
			pallette.dark = color;
			continue;
		}

		if (isLight(color) && !pallette.light) {
			pallette.light = color;
			continue;
		}

		if (!isDark(color) && !isLight(color) && !pallette.accent) {
			pallette.accent = color;
			continue;
		}
	}

	if (!pallette.light) {
		console.warn(
			"couldn't find a light color, falling back to the lightest color",
		);
		pallette.light = colorsList.reduce((prev, curr) => {
			return getGray(prev) > getGray(curr) ? prev : curr;
		}, BLACK_RGB);

		if (getGray(pallette.light) < 120) {
			pallette.light = lighten(pallette.light, 150);
		}
	}

	if (!pallette.dark) {
		console.warn(
			"couldn't find a dark color, falling back to the darkest color",
		);
		pallette.dark = colorsList.reduce((prev, curr) => {
			return getGray(prev) < getGray(curr) ? prev : curr;
		}, WHITE_RGB);

		pallette.dark = darken(pallette.dark, 40);
	}

	if (!pallette.accent) {
		console.warn(
			"Couldn't generate an accent color, using existing dark color",
		);
		pallette.accent = lighten(pallette.dark, 60);
	}

	// we set those two because new Dark/Light colors might not exist in out Hashmap
	const darkAmount = colors[pallette.dark.join(",")] || 0;
	const lightAmount = colors[pallette.light.join(",")] || 0;
	console.info({ lightAmount, darkAmount });

	pallette.text = getGray(pallette.accent) < 200 ? WHITE_RGB : BLACK_RGB;
	pallette.borders = darken(pallette.accent, 60);
	pallette.accentHover = lighten(pallette.accent, 10);
	pallette.softDark = lighten(pallette.dark, 40);
	pallette.softLight = darken(pallette.light, 50);
	pallette.darkHover = lighten(pallette.dark, 5);

	pallette.main =
		darkAmount <= lightAmount ? pallette.dark : darken(pallette.light, 85);
	pallette.softMain =
		darkAmount <= lightAmount
			? pallette.softDark
			: darken(pallette.softLight, 65);
	pallette.secondary =
		darkAmount <= lightAmount
			? lighten(pallette.dark, 70)
			: darken(pallette.light, 60);

	if (Math.abs(colorDifference(pallette.softLight, pallette.softDark)) < 80) {
		pallette.softLight = lighten(pallette.softLight, 35);
		pallette.softDark = darken(pallette.softDark, 25);
	}

	return pallette;
}

/* ----------------------- */
/* Helper Functions (Pure) */
/* ----------------------- */

const RED_CONTRIB = 0.3;
const GREEN_CONTRIB = 0.59;
const BLUE_CONTRIB = 0.11;

function isDark(color: RGBColor): boolean {
	return getGray(color) < 50;
}

function isLight(color: RGBColor): boolean {
	return getGray(color) > 200;
}

const clampColor = (val: number) => clamp(val, 255, 0);

function darken(color: RGBColor, amount: number): RGBColor {
	const [r, g, b] = color;

	return [
		r - amount * RED_CONTRIB,
		g - amount * GREEN_CONTRIB,
		b - amount * BLUE_CONTRIB,
	].map(clampColor) as RGBColor;
}
function lighten(color: RGBColor, amount: number): RGBColor {
	const [r, g, b] = color;

	return [
		r + amount * RED_CONTRIB,
		g + amount * GREEN_CONTRIB,
		b + amount * BLUE_CONTRIB,
	].map(clampColor) as RGBColor;
}

export function clamp(val: number, max: number, min: number) {
	return Math.max(min, Math.min(val, max));
}

function getGray(color: RGBColor): number {
	return color[0] * 0.3 + color[1] * 0.59 + color[2] * 0.11;
}

function colorDifference(color: RGBColor, target: RGBColor): number {
	const a = getGray(color);
	const b = getGray(target);

	return Math.abs(a - b);
}

/* ------------------------- */
/* Helper Functions (Impure) */
/* ------------------------- */
function readFile(file: File): Promise<string> {
	const fs = new FileReader();

	return new Promise((res, rej) => {
		fs.onloadend = () => {
			res(fs.result as string);
		};
		fs.onerror = () => {
			rej(fs.error);
		};
		fs.readAsDataURL(file);
	});
}

/* Takes a base64 encoded image and returns an array of the corresponding pixels. */
function getImagePixels(data: string): Promise<ArrayLike<number>> {
	return new Promise((res, rej) => {
		const img = document.createElement("img");
		img.onerror = rej;
		img.onload = () => {
			const canvas = document.createElement("canvas");
			const ctx = canvas.getContext("2d");
			if (!ctx) return rej(Error("No context!"));

			canvas.width = img.width;
			canvas.height = img.height;

			console.log("%dx%d", canvas.width, canvas.height);

			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

			res(pixels);
		};

		img.src = data;
	});
}

function applyColorScheme(pallette: ColorPallette) {
	$(":root")
		.setProperty("--dark" as any, `rgb(${pallette.dark.join(",")})`)
		.setProperty(
			"--dark-opaque" as any,
			`rgba(${pallette.dark.join(",")}, 0.8)`,
		)
		.setProperty("--soft-dark" as any, `rgb(${pallette.softDark.join(",")})`)
		.setProperty("--main" as any, `rgb(${pallette.main.join(",")})`)
		.setProperty("--soft-main" as any, `rgb(${pallette.softMain.join(",")})`)
		.setProperty("--soft-light" as any, `rgb(${pallette.softLight.join(",")})`)
		.setProperty("--dark-hover" as any, `rgb(${pallette.darkHover.join(",")})`)
		.setProperty("--light" as any, `rgb(${pallette.light.join(",")})`)
		.setProperty("--accent" as any, `rgb(${pallette.accent.join(",")})`)
		.setProperty(
			"--accent-hover" as any,
			`rgb(${pallette.accentHover.join(",")})`,
		)
		.setProperty("--borders" as any, `rgb(${pallette.borders.join(",")})`)
		.setProperty("--text" as any, `rgb(${pallette.text.join(",")})`)
		.setProperty("--secondary" as any, `rgb(${pallette.secondary.join(",")})`);
}
