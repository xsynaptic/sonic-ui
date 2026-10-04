# sonic-ui

Native custom elements for audio interfaces on the web. The controls render in the light DOM, and their look comes from tokens (CSS custom properties), so a skin is just a set of `--sonic-*` values. They need no framework and have no runtime dependencies.

The repository holds two packages:

- [`packages/sonic-ui`](packages/sonic-ui) is the library, `@xsynaptic/sonic-ui`. Its README covers setup.
- [`playground`](playground) is an Astro site that shows every control, a tuner for adjusting the tokens live, and the predefined skins.

A demo is available at [xsynaptic.github.io/sonic-ui](https://xsynaptic.github.io/sonic-ui/).

To run the playground, which rebuilds the library as you edit it:

```sh
pnpm install
pnpm dev
```

Released under the MIT license.
