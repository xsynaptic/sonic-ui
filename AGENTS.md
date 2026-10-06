# sonic-ui

`@xsynaptic/sonic-ui`: native custom elements for audio interfaces. Light DOM, no framework, no runtime dependencies; Astro lives only in `playground/`.

Plans in `.claude/tasks/` (gitignored) carry a frontmatter `status`; only `ready` is live work.

Vocabulary: `.claude/glossary.md` defines each control, part and value term and the words it replaces; read it before naming anything. Pick the most accurate name for a new thing. If the glossary already uses or avoids that word, ask which meaning should keep it rather than settling for a weaker name.

## Public repo

Everything tracked is public and stands alone. Name no person and none of our other projects in code, comments, fixtures, docs, changesets or commit messages; describe the situation instead ("a docked player bar with `backdrop-filter`"). Dependencies and file formats are named as they are. The `author` field and the licence are the only exceptions. Gitignored notes under `.claude/` may name anything.

## Public surface

Tokens, hook classes, attributes, events and `:state()` names are the API. Renaming one, or nesting a hook class differently, breaks someone's skin; call it out in the changeset.

- Every public name carries the `sonic` prefix, data attributes and the layer included.
- Skins set public tokens only. When a skin needs a hook-class rule, add the missing token instead.
- Geometry is a ratio of the control's size, so a control scales as one piece; the few absolute lengths are deliberate.
- One light: every directional gradient or shadow derives from `--sonic-light-tilt`. What turns with a control or is radially symmetric stays evenly shaded.
- `.` exports the classes with no side effects; registration lives only in `./define` and `./define/<control>`.

## Design rules

- Drawn parts, styles and ARIA stay in the light DOM; the mirror's shadow root is the only one.
- Layout stays inside the control's box; only focus and the readout popover paint past it, and only a target (`--sonic-target-size`, unset by default; a press control's, or a slider's across its breadth) takes presses past it.
- A touch outside the part that owns a gesture still scrolls the page.
- Forced colours: drawn parts opt out and take system colours; the focusable element stays forced so its outline paints.
- A private value that script or a canvas reads is registered with `@property`; a raw token does not resolve there.
- A control uses only the children it documents, and puts its control back when removed.
- A control draws on connect: until then attributes and properties are held as values, and the drawn parts, form value and states are written in the one render `connect` runs.

## Build gotchas

- Material sheets (`styles/material/`) sit in `sonic.material` and control sheets in `sonic.control`. Every control sheet opens with `@layer sonic.material, sonic.control;`, so sheets load in any order.
- Sheets never import each other, because bundlers duplicate a shared import. Only `material.css` and `controls.css` are import lists.
- Two material sheets never set the same private property on the same class. When one needs a say in another's, it sets a property of its own that the other reads (see `--_sonic-glass-own`).
- A control's material sheets are listed in its `checkStyles` call, in `sheetMaterial` (`playground/src/scripts/solos.ts`) and in the README table; `solo.spec.ts` fails if a list is short.
- `sideEffects` lists `./src/define*`; without it the built `define` entries come out empty.
- Development-only code sits behind `__DEV__`, never `process.env.NODE_ENV`.

## The gate

Run `pnpm fix` after a chunk of work; it autofixes, then runs `pnpm check`. `check` is green on main, so anything it reports is yours.

Run `pnpm test-e2e` after changing a gesture, a control's naming, or its drawn parts; reach for `pnpm test-e2e-full` when a change is engine-specific.

Library changes get a changeset (`pnpm changeset`). Until 1.0, keep changesets short and grouped, and add little to READMEs and package descriptions.

## Visual checks

When a person needs to judge how something looks, show it to them live in the playground and give them the URL.

To check your own work, take one look at the running dev server in a single browser. Never script batches of screenshots or launch extra engines for a look. When the right appearance can be stated as a fact (a size, a colour, an edge), assert it in an e2e test instead of looking.

## Tests

- A test earns its place by failing on a plausible bug. One that reads back template markup, or restates a constant as a table, fails only when someone edits that line; leave it out.
- Choose inputs that move the arithmetic: `step` other than 1, `min` other than 0.
- Listen for `input` and `change` on a parent, as consumers do; bubbling is API.
- happy-dom has no layout, computed styles, canvas, popover or `ElementInternals`. Test geometry as pure functions and mock `getBoundingClientRect` for pointer maths.
- E2E covers only what needs a real engine: trusted input, computed CSS, focus, forced colours, forms.
- `pnpm stryker` audits test strength on demand; read the survivors, not the score.
