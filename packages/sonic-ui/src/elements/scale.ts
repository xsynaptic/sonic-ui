import type { SonicValueElement } from '#elements/value-element.ts';

import { linkValue } from '#elements/value-element.ts';
import { copyNode } from '#lib/copy-node.ts';
import { mirrorChildren } from '#lib/mirror-children.ts';
import { placeChildren } from '#lib/render.ts';

type ScaleMark = HTMLElement | SVGElement;

function scaleValue(mark: ScaleMark): number {
	const text = mark.dataset.sonicValue?.trim();

	return text ? Number(text) : NaN;
}

function scaleMark(original: ChildNode): ScaleMark | undefined {
	const mark = copyNode(original);
	if (!(mark instanceof HTMLElement || mark instanceof SVGElement)) return undefined;
	if (!Number.isFinite(scaleValue(mark))) return undefined;

	const isTick = mark.childElementCount === 0 && mark.textContent.trim() === '';

	mark.classList.add(isTick ? 'sonic-scale-tick' : 'sonic-scale-label');

	return mark;
}

export function bindScale(
	element: SonicValueElement,
	{ control, marks }: { control: HTMLElement; marks: HTMLElement },
	signal: AbortSignal,
): void {
	const { mapping, watch } = linkValue(element);
	const render = (): void => {
		const { proportionOf } = mapping();

		for (const mark of marks.children) {
			if (!(mark instanceof HTMLElement || mark instanceof SVGElement)) continue;

			const at = String(proportionOf(scaleValue(mark)));

			if (mark.style.getPropertyValue('--_sonic-scale-at') !== at) {
				mark.style.setProperty('--_sonic-scale-at', at);
			}
		}
	};

	mirrorChildren(
		element,
		{
			control,
			copy: scaleMark,
			isCopied: (child) => child instanceof Element && child.matches('[data-sonic-value]'),
			isPassed: (child) => child instanceof Element && child.matches('.sonic-led'),
			place: (copies) => {
				placeChildren(marks, copies);
				render();
			},
		},
		signal,
	);
	signal.addEventListener('abort', watch(render), { once: true });
}
