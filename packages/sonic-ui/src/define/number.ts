import { defineOnce } from '#elements/define-once.ts';
import { SonicNumber } from '#elements/number.ts';

defineOnce('sonic-number', SonicNumber);

// Type-only, so the tag map augmentation ships without a runtime export
/** @public */
export type { SonicNumber } from '#elements/number.ts';
