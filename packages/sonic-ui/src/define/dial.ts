import { defineOnce } from '#elements/define-once.ts';
import { SonicDial } from '#elements/dial.ts';

defineOnce('sonic-dial', SonicDial);

// Type-only, so the tag map augmentation ships without a runtime export
/** @public */
export type { SonicDial } from '#elements/dial.ts';
