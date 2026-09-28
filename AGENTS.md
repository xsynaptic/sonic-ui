# sonic-ui

`@xsynaptic/sonic-ui`: native custom elements for audio interfaces. Light DOM, no framework, no runtime dependencies; Astro lives only in `playground/`.

`playground/` runs the built `dist`, so keep `pnpm dev` running or run `pnpm build` before judging a change there.

## Local notes

`.claude/` holds gitignored notes, so a fresh clone has none of them.

- `reference/controls.md`: why each control looks and behaves as it does, rejected versions included. Read it before changing a control's look or gesture.
- `reference/design.md`: the library's design and the survey behind it.
- `tasks/`: plans with a frontmatter `status`. Only `ready` is live work; every other status is settled.

## Public surface

Tokens, hook classes, attributes and events are the API. Renaming one, or nesting a hook class differently, breaks someone's skin; call it out in the changeset.

- Every public name carries the `sonic` prefix, data attributes and the layer included.
- Skins set public tokens only. When a skin needs a hook-class rule, add the missing token instead.
- Geometry is a ratio of the control's size, so a control scales as one piece. Size lengths, dial travel, ridge pitch and sweep are the deliberate absolutes.
- One light: every directional gradient or shadow reads the fall and cast values derived from `--sonic-light-tilt`. What turns with a control (knurl, pointer) or is radially symmetric (groove, rim, focus ring) stays evenly shaded.
- `.` exports the classes with no side effects; registration lives only in `./define` and `./define/<control>`.

## Gotchas

- `material.css` loads once, before any control's sheet. Control sheets leave it out because Tailwind v4 inlines a repeated `@import` once per importer.
- `sideEffects` lists `./src/define*` because tsdown reads it while building; without those entries `dist/define.js` comes out empty.
- Imports use the `#*` subpaths with an explicit `.ts` extension, sibling files included.
- Layout stays inside the control's box. Only the focus glow (`box-shadow`) and the readout popover paint past it; the focus-visible outline is `2px solid transparent` at `-2px` so forced colours still paint it.
- `:hover` sits under `@media (hover: hover)`; its `:focus-visible` partner stays outside.

## The gate

Run `pnpm fix` after a chunk of work; it autofixes, then runs `pnpm check`. `check` is green on main, so anything it reports is yours. Library changes get a changeset (`pnpm changeset`).
