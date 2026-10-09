# @xsynaptic/sonic-ui

Native custom elements for audio interfaces. Each control renders in the light DOM, skinned with `--sonic-*` tokens (CSS custom properties). No framework, no runtime dependencies.

Early and unstable: any 0.x release may break the API, and the changelog is where a control's behaviour is described. This README holds setup and the contracts every control shares. For the rest, read the package:

- Properties and methods: `dist/dev/elements/<control>.d.ts`. Every attribute has a property of the same name in camel case.
- Tokens and their defaults: `dist/styles/<control>.css` and `dist/styles/material/`, where each token is read as `var(--sonic-…, default)`.
- Working markup for every control: `playground/src/components/specimens/` in the repository.

## Setup

```sh
pnpm add @xsynaptic/sonic-ui
```

```js
import '@xsynaptic/sonic-ui/define';
```

```css
@layer base, sonic, components;

@import 'reset.css' layer(base);
@import '@xsynaptic/sonic-ui/controls.css';
@import '@xsynaptic/sonic-ui/skins/slate.css';
```

```html
<body class="sonic-skin-slate">
	<sonic-dial aria-label="Cutoff" value="40"></sonic-dial>
</body>
```

- Every sheet sits in the `sonic` layer. A rule outside any layer beats every layered one, so an unlayered reset strips padding, borders and type from the controls: import a reset into a layer declared before `sonic`, and keep your own rules in one declared after.
- A skin sheet does nothing until its class, `sonic-skin-<name>`, is on an ancestor. The skins are `slate`, `amber`, `ivory`, `lime` and `flat`. With no skin a control is bare, drawn in the text colour around it.
- `./define` registers every control and `./define/<control>` registers one. `.` exports the classes and registers nothing.
- Under a bundler that sets the `development` condition, as Vite's dev server does, the controls warn in the console about a missing sheet, a reset, a box property on a host and a child they do not use. Read the console before debugging.

## Contracts

- The host is `display: contents` and the control is an element inside it. A width, margin or transform on the host does nothing: size a control with its token (`--sonic-dial-size`, `--sonic-slider-length`), set on the host or any ancestor, and place it with its parent's layout.
- The split is the one host with a box: `<sonic-split>` is inline until given a display, and laying it out is yours.
- Register the classes under their stock tag names (`sonic-dial`, `sonic-split`). The sheets and the split key on them, so a split under another tag finds no members.
- Name every control with `aria-label` or `aria-labelledby` on the host, or with a `<label>` for a form-associated one.
- A boolean attribute is on when present, whatever its value, so `pressed="false"` latches a button. From a framework pass `undefined`, never `false`.
- A control uses only the children it documents and adds one child of its own. Children it draws are copied, so a copy has none of your listeners; keep them static. Under a hydrating framework, register the definitions once hydration is done (in React, from an effect).
- Events bubble and carry no detail: read the property when one fires. A control knows nothing about playback, so wire its events to your own state and write the property back.
- A value control fires `input` as its value moves and `change` once when a gesture ends. A drag owns the value: a write to `value` during one is dropped.
- `formatValue` and `parseValue` are properties holding functions. Once `parseValue` is set it has to read what `formatValue` writes, or typed entry opens on text it cannot take.
- To show a control without taking input, set `inert` on the host. It leaves the tab order and the accessibility tree and ignores presses, and it keeps its colours and keeps drawing; `disabled` dims it and is announced as disabled.
- A display takes its signal as data, and nothing in the library fetches, decodes or opens an `AudioContext`.
- States a control sets itself are custom states on the host, selected with `:state()`.
- The LED, the panel, the ring and the screen have no behaviour, so they are classes on your own elements (`sonic-led`, `sonic-panel`, `sonic-ring`, `sonic-screen`). A control draws no glass of its own: wrap one in a screen for the encased look.

## Skinning

A skin is one rule that sets tokens on a class; copy `dist/skins/flat.css` to start one. Tokens, hook classes (`.sonic-dial`), `data-sonic-*` attributes and states are the public surface. Anything starting `--_sonic-` is private and changes without notice.

- Set tokens, not rules on hook classes. If a look needs a hook-class rule, a token is missing.
- A token ending in `-ratio` is a unitless share of the control's size, so one size token scales the whole control. A length token takes any CSS length except a percentage.

## Loading less

`controls.css` loads everything. To load less, import each control's sheet and the material sheets it needs, in any order:

```css
@import '@xsynaptic/sonic-ui/material/core.css';
@import '@xsynaptic/sonic-ui/material/lens.css';
@import '@xsynaptic/sonic-ui/material/groove.css';
@import '@xsynaptic/sonic-ui/meter.css';
```

| Sheet           | Needs from `material/`                          |
| --------------- | ----------------------------------------------- |
| `button.css`    | core, cap, well, keycap                         |
| `dial.css`      | core, cap, glass, readout, value, arc, scale    |
| `envelope.css`  | core, glass, readout, reticle                   |
| `led.css`       | core, lens                                      |
| `meter.css`     | core, lens, groove                              |
| `number.css`    | core, cap, value                                |
| `panel.css`     | core                                            |
| `region.css`    | core, cap                                       |
| `ring.css`      | core, arc                                       |
| `screen.css`    | core, glass, pane, well                         |
| `segmented.css` | core, cap, well, keycap                         |
| `slider.css`    | core, cap, glass, readout, value, groove, scale |
| `spectrum.css`  | core                                            |
| `switch.css`    | core, cap                                       |
| `toggle.css`    | core, cap, well, keycap                         |
| `waveform.css`  | core, cap, glass, readout, value                |
| `wavestrip.css` | core, cap, glass, readout, value                |
| `xy.css`        | core, cap, glass, readout, reticle              |

An LED inside a control also needs `led.css`, and a button inside a ring needs `button.css`. Only a missing `core.css` or control sheet is warned about, so check a control that draws wrong against this table.

Tested in current Chrome, Firefox and Safari. Known to work from Chrome 111, Safari 16.4 and Firefox 128; older versions are best effort. No control mirrors for right-to-left. MIT licensed.
