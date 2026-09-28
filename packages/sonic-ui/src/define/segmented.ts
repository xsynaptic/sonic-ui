import { defineOnce } from '#elements/define-once.ts';
import { SonicSegmented } from '#elements/segmented.ts';

defineOnce('sonic-segmented', SonicSegmented);

// Type-only, so the tag map augmentation ships without a runtime export
/** @public */
export type { SonicSegmented } from '#elements/segmented.ts';
