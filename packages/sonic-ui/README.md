# @xsynaptic/sonic-ui

Native custom elements for audio interfaces. Each control renders in the light DOM, skinned with `--sonic-*` tokens (CSS custom properties). No framework, no runtime dependencies.

Early and unstable: any 0.x release may break the API.

```sh
pnpm add @xsynaptic/sonic-ui
```

```js
import '@xsynaptic/sonic-ui/define';
```

```css
@layer base, sonic, components;

@import '@xsynaptic/sonic-ui/controls.css';
@import '@xsynaptic/sonic-ui/skins/slate.css';
```

```html
<sonic-dial aria-label="Cutoff" value="40"></sonic-dial>
```

A display takes its signal as data: `spectrum.analyser = node`, or `spectrum.push(frame)`.

Under a hydrating framework, register the definitions once hydration is done (in React, from an effect); a control owns one child of its host and uses only the children it documents.

Targets current Chrome and Edge, Safari 26 and Firefox 147. MIT licensed.
