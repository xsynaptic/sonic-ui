# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).

1. Make changes to the library.
2. Run `pnpm changeset` and describe the change, picking a semver bump.
3. Commit the generated changeset file alongside the work.

Releases run locally: `pnpm changeset version`, then `pnpm build` and `pnpm changeset publish`. The `access: public` setting in `config.json` publishes the scoped package publicly.
