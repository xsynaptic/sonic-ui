import { defineOnce } from '#elements/define-once.ts';
import { SonicMeter } from '#elements/meter.ts';

defineOnce('sonic-meter', SonicMeter);

// Type-only, so the tag map augmentation ships without a runtime export
/** @public */
export type { SonicMeter } from '#elements/meter.ts';
