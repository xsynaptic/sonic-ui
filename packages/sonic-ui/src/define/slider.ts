import { defineOnce } from '#elements/define-once.ts';
import { SonicSlider } from '#elements/slider.ts';

defineOnce('sonic-slider', SonicSlider);

// Type-only, so the tag map augmentation ships without a runtime export
/** @public */
export type { SonicSlider } from '#elements/slider.ts';
