import type { MirrorSlots } from '#lib/render.ts';

import { appendOnce, checkChildren } from '#lib/owned-control.ts';
import { attachSlots } from '#lib/render.ts';

declare const __DEV__: boolean;

const checkedMirrors = new WeakSet<object>();

const hostSlots = new WeakMap<HTMLElement, MirrorSlots>();

const interactive = 'a[href], button, input, select, textarea, [tabindex]';

interface Mirror {
	control: Element;
	copy: (original: ChildNode) => Node | undefined;
	isCopied?: (child: Node) => boolean;
	isPassed?: (child: Node) => boolean;
	place: (copies: Array<Node>) => void;
}

function unmirrorable(original: Node): Element | undefined {
	if (!(original instanceof Element)) return undefined;

	return [original, ...original.querySelectorAll('*')].find(
		(element) => element.matches(interactive) || element.localName.includes('-'),
	);
}

function checkMirrored(host: HTMLElement, originals: Array<Node>): void {
	if (!__DEV__ || checkedMirrors.has(host.constructor)) return;

	const [found] = originals.flatMap((original) => unmirrorable(original) ?? []);
	if (!found) return;

	checkedMirrors.add(host.constructor);
	console.warn(
		`<${host.localName}> copies its children into the control, so the <${found.localName}> inside it loses its listeners and state; keep mirrored children static`,
	);
}

function childHolding(host: HTMLElement, node: Node): Node | undefined {
	let current: Node | null = node;

	while (current && current.parentNode !== host) current = current.parentNode;

	return current ?? undefined;
}

function isCopiedChange(
	host: HTMLElement,
	record: MutationRecord,
	{ control, isCopied }: Required<Pick<Mirror, 'control' | 'isCopied'>>,
): boolean {
	if (record.target === host) {
		return (
			record.removedNodes.length > 0 || [...record.addedNodes].some((node) => node !== control)
		);
	}

	const child = childHolding(host, record.target);

	if (child === undefined) return false;

	return isCopied(child) || (record.type === 'attributes' && record.target === child);
}

export function mirrorChildren(
	host: HTMLElement,
	{ control, copy, isCopied = () => true, isPassed = () => false, place }: Mirror,
	signal: AbortSignal,
): void {
	const slots = hostSlots.get(host) ?? attachSlots(host);
	let copies = new Map<ChildNode, Node | undefined>();

	hostSlots.set(host, slots);
	const mirror = (touched?: Set<Node | undefined>): void => {
		appendOnce(host, control);

		const children = [...host.childNodes].filter((child) => child !== control);
		const slotted = children.filter(
			(child): child is Element | Text => child instanceof Element || child instanceof Text,
		);
		const kept = copies;
		const originals = children.filter((child) => isCopied(child));

		if (__DEV__) {
			checkMirrored(host, originals);
			checkChildren(
				host,
				children.filter((child) => !isCopied(child) && !isPassed(child)),
			);
		}
		copies = new Map(
			originals.map((original) => [
				original,
				touched && !touched.has(original) && kept.has(original)
					? kept.get(original)
					: copy(original),
			]),
		);
		place([...copies.values()].filter((made) => made !== undefined));
		slots.shown.assign(...slotted.filter((child) => !isCopied(child)), control);
		slots.kept.assign(...slotted.filter((child) => isCopied(child)));
	};
	// Each child is watched, never the control, so a value write wakes nothing
	const watch = (): void => {
		observer.disconnect();
		observer.observe(host, { childList: true });
		for (const child of host.childNodes) {
			if (child === control) continue;

			observer.observe(child, {
				attributes: true,
				characterData: true,
				childList: true,
				subtree: true,
			});
		}
	};
	const observer = new MutationObserver((records) => {
		const changes = records.filter((record) => isCopiedChange(host, record, { control, isCopied }));
		if (changes.length === 0) return;

		if (changes.some((record) => record.target === host)) {
			mirror();
			watch();
		} else mirror(new Set(changes.map((record) => childHolding(host, record.target))));
	});

	mirror();
	watch();
	signal.addEventListener(
		'abort',
		() => {
			observer.disconnect();
		},
		{ once: true },
	);
}
