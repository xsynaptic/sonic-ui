# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).

1. Make changes to the library.
2. Run `pnpm changeset` and describe the change, picking a semver bump.
3. Commit the generated changeset file alongside the work.

To publish, run `pnpm version-packages`, commit the result, then run `pnpm release`, which checks the branch, the tree and the npm login, runs the gate and the e2e suite quietly, publishes and pushes with tags. `pnpm release --dry-run` stops before publishing.

The `access: public` setting in `config.json` publishes the scoped package publicly.
