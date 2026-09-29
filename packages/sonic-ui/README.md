# @xsynaptic/sonic-ui

Native custom elements for audio interfaces. Each control renders in the light DOM, drawn in CSS, skinned with `--sonic-*` custom properties. No framework, no runtime dependencies.

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

## Usage

- **Attributes and properties** reflect each other: `dial.max = 200` writes `max="200"`. `value` and the key's `pressed` are the live state and never write their attribute, as on native inputs.
- **Events:** `change` when a control settles, and `input` while a dial or slider moves; both bubble.
- **Formatting:** `formatValue` sets the text the readout and assistive technology read, and `parseValue` reads typed entry back. `formatPercent` and `parsePercent` from the package root show 0 to 1 as a percentage.
- **Forms:** controls that hold a value submit under their `name`, reset, take a `<label>`, and follow a disabled `<fieldset>`, as native inputs do.

## Browsers

Current Chrome and Edge, Safari 26 and Firefox 147.

## License

MIT
