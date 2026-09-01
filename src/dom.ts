export type Display =
	| "inline"
	| "block"
	| "flex"
	| "inline-flex"
	| "inline-block"
	| "grid"
	| "contents";

const EventBus = new Map<HTMLElement, Map<string, (self: Init) => void>>();

export class Init {
	elem: HTMLElement;

	static defaultDisplay: Display = "flex";

	constructor(elem: HTMLElement) {
		this.elem = elem;
	}

	get content() {
		return this.elem.innerText;
	}

	set content(v: string) {
		this.elem.innerText = v;
	}

	get HTML() {
		return this.elem.innerHTML;
	}

	set HTML(v: string) {
		this.elem.innerHTML = v;
	}

	get value() {
		if (
			this.elem instanceof HTMLInputElement ||
			this.elem instanceof HTMLTextAreaElement
		)
			return this.elem.value;
		else return "";
	}

	set value(value: string) {
		(this.elem as HTMLInputElement).value = value;
	}

	get rect() {
		return this.elem.getBoundingClientRect();
	}

	display(display: boolean | Display) {
		switch (display) {
			case false:
				this.elem.style.display = "none";
				break;

			case true:
				this.elem.style.display = Init.defaultDisplay;
				break;

			default:
				this.elem.style.display = display;
				break;
		}

		return this;
	}

	append(child: HTMLElement | this | string | Node) {
		if (child instanceof Init) {
			this.elem.appendChild(child.elem);
		} else if (typeof child !== "string") {
			this.elem.appendChild(child);
		} else {
			this.elem.innerHTML += child;
		}

		return this;
	}

	prepend(child: HTMLElement | this | string | Node) {
		if (child instanceof Init) {
			this.elem.prepend(child.elem);
		} else if (typeof child !== "string") {
			this.elem.prepend(child);
		} else {
			this.elem.innerHTML = child + this.elem.innerHTML;
		}

		return this;
	}

	clone() {
		return new Init(this.elem.cloneNode() as HTMLElement);
	}

	get handlers() {
		if (!EventBus.has(this.elem)) EventBus.set(this.elem, new Map());
		return EventBus.get(this.elem)!;
	}

	localOn(event: string, handler: (self: Init) => void) {
		this.handlers.set(event, handler);
	}

	emit(event: string) {
		const fn = this.handlers.get(event);
		if (!fn) return;
		fn(this);
	}

	on<K extends keyof HTMLElementEventMap>(
		event: K,
		handler: (this: HTMLElement, ev: HTMLElementEventMap[K]) => void,
		cfg?: boolean | AddEventListenerOptions,
	) {
		this.elem.addEventListener(event, handler, cfg);
	}

	once<K extends keyof HTMLElementEventMap>(
		event: K,
		handler: (this: HTMLElement, ev: HTMLElementEventMap[K]) => void,
	) {
		this.elem.addEventListener(event, handler, { once: true });
	}

	off<K extends keyof HTMLElementEventMap>(
		event: K,
		handler: (this: HTMLElement, ev: HTMLElementEventMap[K]) => void,
	) {
		this.elem.removeEventListener(event, handler);
	}

	setProperty(property: string, value: any) {
		this.elem.style.setProperty(property, value);
		return this;
	}

	setProp<K extends keyof CSSStyleDeclaration>(
		property: K,
		value: CSSStyleDeclaration[K],
	) {
		this.elem.style[property] = value;
		return this;
	}

	removeProperty<K extends keyof CSSStyleDeclaration>(property: K) {
		this.elem.style[property] = "" as CSSStyleDeclaration[K];
		return this;
	}

	child(selector: string) {
		const elem = this.elem.querySelector<HTMLElement>(selector);
		if (!elem) return null;

		return new Init(elem);
	}
}

export function $(input: string | HTMLElement) {
	if (typeof input == "string") {
		const e = document.querySelector(input)!;
		if (!e) throw new Error("Fuck");
		return new Init(e as HTMLElement);
	} else {
		return new Init(input);
	}
}

$.all = function (input: string) {
	return Array.from(document.querySelectorAll<HTMLElement>(input)).map((e) =>
		$(e),
	);
};

$.root = new Init(document.body);

$.ready = function (listener: () => void) {
	window.addEventListener("DOMContentLoaded", listener);
};
