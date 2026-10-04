# sonic-ui

`@xsynaptic/sonic-ui`: native custom elements for audio interfaces. Light DOM, no framework, no runtime dependencies; Astro lives only in `playground/`.

`playground/` runs the built `dist`, so keep `pnpm dev` running or run `pnpm build` before judging a change there.

Plans in `.claude/tasks/` (gitignored) carry a frontmatter `status`; only `ready` is live work.

Vocabulary: `.claude/context.md` defines each control, part and value term and the words it replaces; read it before naming anything.

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
- Layout stays inside the control's box; only focus and the readout popover paint past it.
- A touch outside the part that owns a gesture still scrolls the page.
- Forced colours: drawn parts opt out and take system colours; the focusable element stays forced so its outline paints.
- A private value that script or a canvas reads is registered with `@property`; a raw token does not resolve there.

## Build gotchas

- `material.css` loads once, before any control's sheet; control sheets leave it out.
- `sideEffects` lists `./src/define*`; without it the built `define` entries come out empty.
- Development-only code sits behind `__DEV__`, never `process.env.NODE_ENV`.

## The gate

Run `pnpm fix` after a chunk of work; it autofixes, then runs `pnpm check`. `check` is green on main, so anything it reports is yours.

Run `pnpm test-e2e` after changing a gesture, a control's naming, or its drawn parts; reach for `pnpm test-e2e-full` when a change is engine-specific.

Library changes get a changeset (`pnpm changeset`). Until 1.0, keep changesets short and grouped, and add little to READMEs and package descriptions.

## Tests

- A test earns its place by failing on a plausible bug. One that reads back template markup, or restates a constant as a table, fails only when someone edits that line; leave it out.
- Choose inputs that move the arithmetic: `step` other than 1, `min` other than 0.
- Listen for `input` and `change` on a parent, as consumers do; bubbling is API.
- happy-dom has no layout, computed styles, canvas, popover or `ElementInternals`. Test geometry as pure functions and mock `getBoundingClientRect` for pointer maths.
- E2E covers only what needs a real engine: trusted input, computed CSS, focus, forced colours, forms.
- `pnpm stryker` audits test strength on demand; read the survivors, not the score.
