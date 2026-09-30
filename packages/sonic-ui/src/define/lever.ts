import { defineOnce } from '#elements/define-once.ts';
import { SonicLever } from '#elements/lever.ts';

defineOnce('sonic-lever', SonicLever);

// Type-only, so the tag map augmentation ships without a runtime export
/** @public */
export type { SonicLever } from '#elements/lever.ts';
