import { $, Init } from "./dom";
import { clamp } from "./pallette";

export namespace Range {
	export function init(obj: Init) {
		let press = false;

		obj
			.child(".indicator")
			?.setProp("width", `${obj.elem.getAttribute("value") ?? 0}%`);

		$.root.on("mouseover", (ev) => {
			if (!press) return;
			ev.preventDefault();

			calcValue(obj, ev.clientX);
		});

		obj.on("mousedown", (e) => {
			if (e.button != 0) return;
			e.preventDefault();
			press = true;

			calcValue(obj, e.clientX);
		});

		$.root.on("mouseup", (e) => {
			e.preventDefault();
			press = false;
		});
	}

	export function value(obj: Init) {
		return Number(obj.elem.getAttribute("value") ?? 0);
	}

	export function setValue(obj: Init, value: number) {
		obj.elem.setAttribute("value", String(value));
		obj.child(".indicator")?.setProp("width", `${value}%`);
		obj.emit("change");
	}

	function calcValue(obj: Init, clientX: number) {
		const raw = clientX - obj.rect.x;
		const value = Math.floor(clamp((raw / obj.rect.width) * 100, 100, 0));

		obj.elem.setAttribute("value", String(value));
		obj.child(".indicator")?.setProp("width", `${value}%`);
		obj.emit("change");
	}
}

export namespace Toggle {
	export function init(obj: Init) {
		obj.on("click", (ev) => {
			ev.preventDefault();
			obj.elem.toggleAttribute("enabled");
			obj.emit("change");
		});
	}

	export function value(obj: Init) {
		return obj.elem.getAttribute("enabled") != null;
	}

	export function setValue(obj: Init, value: boolean) {
		if (value == Toggle.value(obj)) return;
		obj.elem.toggleAttribute("enabled");
		obj.emit("change");
	}
}
