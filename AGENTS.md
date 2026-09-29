# sonic-ui

`@xsynaptic/sonic-ui`: native custom elements for audio interfaces. Light DOM, no framework, no runtime dependencies; Astro lives only in `playground/`.

`playground/` runs the built `dist`, so keep `pnpm dev` running or run `pnpm build` before judging a change there.

Plans in `.claude/tasks/` (gitignored) carry a frontmatter `status`; only `ready` is live work.

## Public repo

Everything tracked is public and stands alone. Name no person and no other project in code, comments, fixtures, docs, changesets or commit messages; describe the situation instead ("a docked player bar with `backdrop-filter`"). The `author` field and the licence are the only exceptions. Gitignored notes under `.claude/` may name anything.

## Public surface

Tokens, hook classes, attributes and events are the API. Renaming one, or nesting a hook class differently, breaks someone's skin; call it out in the changeset.

- Every public name carries the `sonic` prefix, data attributes and the layer included.
- Skins set public tokens only. When a skin needs a hook-class rule, add the missing token instead.
- Geometry is a ratio of the control's size, so a control scales as one piece. Size lengths, dial travel, ridge pitch and sweep are the deliberate absolutes.
- One light: every directional gradient or shadow reads the fall and cast values derived from `--sonic-light-tilt`. What turns with a control (knurl, pointer) or is radially symmetric (groove, rim, focus ring) stays evenly shaded.
- `.` exports the classes with no side effects; registration lives only in `./define` and `./define/<control>`.

## Gotchas

- `material.css` loads once, before any control's sheet. Control sheets leave it out because Tailwind v4 inlines a repeated `@import` once per importer.
- `sideEffects` lists `./src/define*` because tsdown reads it while building; without those entries `dist/*/define.js` comes out empty.
- tsdown builds two trees: `dist/dev` for the `development` condition and `dist/default`, split by `__DEV__`. Development-only code sits behind `if (!__DEV__) return;`, never `process.env.NODE_ENV`, which rolldown replaces in our own browser build.
- Imports use the `#*` subpaths with an explicit `.ts` extension, sibling files included.
- Layout stays inside the control's box. Only the focus glow (`box-shadow`) and the readout popover paint past it; the focus-visible outline is `2px solid transparent` at `-2px` so forced colours still paint it, and moves to `2px` outside there in place of the glow they drop.
- `:hover` sits under `@media (hover: hover)`; its `:focus-visible` partner stays outside.
- In forced colours, drawn parts take `forced-color-adjust: none` and system colours; the focusable element stays forced, or its transparent outline never paints.

## The gate

Run `pnpm fix` after a chunk of work; it autofixes, then runs `pnpm check`. `check` is green on main, so anything it reports is yours. Library changes get a changeset (`pnpm changeset`) but until we reach 1.0 keep them short and group them rather than writing a lot of detail. Also until 1.0 we should limit what is added to READMEs and package descriptions to avoid drift.

`pnpm test-e2e` runs on pre-push. Run it too after changing a gesture, a control's naming, or its drawn parts. It starts its own preview on port 4331 and fails if that port is taken.

## Tests

- A test earns its place by failing on a plausible bug. One that reads back template markup, or restates a constant as a table, fails only when someone edits that line; leave it out.
- Choose inputs that move the arithmetic: `step` other than 1, `min` other than 0. Swapped operators hide behind `step="1"`.
- Listen for `input` and `change` on a parent, as consumers do; bubbling is API.
- happy-dom has no layout, popover or `ElementInternals`, so form association is Playwright-only. Mock `getBoundingClientRect` for pointer maths rather than asserting its zero-size boxes.
- E2E covers only what needs a real engine: trusted input, computed CSS, the readout popover, focus across the entry, `:state()`, forced colours, forms.
- `pnpm stryker` audits test strength on demand; read the survivors, not the score, and treat `pnpm stryker-kills` zeros as a list to review.
