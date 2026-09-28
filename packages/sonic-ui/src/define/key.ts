import { defineOnce } from '#elements/define-once.ts';
import { SonicKey } from '#elements/key.ts';

defineOnce('sonic-key', SonicKey);

// Type-only, so the tag map augmentation ships without a runtime export
/** @public */
export type { SonicKey } from '#elements/key.ts';
