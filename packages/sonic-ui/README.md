# @xsynaptic/sonic-ui

Native custom elements for audio interfaces: dials, sliders, keys, a segmented switch, a peak meter and a screen panel. Light DOM, drawn in CSS, skinned with `--sonic-*` custom properties. No framework, no runtime dependencies.

Early and unstable: any 0.x release may break the API.

## Setup

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
<sonic-slider aria-label="Send" value="30"></sonic-slider>
<sonic-key aria-label="Mute" toggle>…</sonic-key>
```

The styles sit in `@layer sonic`, so list it after your resets. A skin (`slate`, `lime` or `ivory`) applies under `.sonic-skin-<name>` on any ancestor. The package root exports the classes without registering them, for your own tag names.

## Browsers

Current Chrome and Edge, Safari 26 and Firefox 147.

## License

MIT
