import { fc } from '@fast-check/vitest';

// The runner picks a mutant's tests by name, and fast-check names each property test by its seed
fc.configureGlobal({ seed: 0 });
