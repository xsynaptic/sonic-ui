# @xsynaptic/sonic-ui

Native custom elements for audio interfaces. Each control renders in the light DOM, skinned with `--sonic-*` tokens (CSS custom properties). No framework, no runtime dependencies.

Early and unstable: any 0.x release may break the API.

This README holds what the package's own files do not say. For the rest, read the package:

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

@import '@xsynaptic/sonic-ui/controls.css';
@import '@xsynaptic/sonic-ui/skins/slate.css';
```

```html
<body class="sonic-skin-slate">
	<sonic-dial aria-label="Cutoff" value="40"></sonic-dial>
</body>
```

- Every sheet sits in the `sonic` layer, so declare it below the layer your own rules live in.
- A rule outside any layer beats every layered one, so an unlayered reset (`* { margin: 0; padding: 0 }`, a zeroed `border`, a bare `button`) strips padding, borders, type sizes and colours from the controls. Import a reset you do not own into a layer declared before `sonic`:

  ```css
  @layer base, sonic, components;

  @import 'reset.css' layer(base);
  ```

- A skin sheet does nothing until its class, `sonic-skin-<name>`, is on an ancestor of the controls. The skins are `slate`, `amber`, `ivory`, `lime` and `flat`; a wrapper with another skin's class reskins what is inside it. With no skin a control is bare: no cap and no well, drawn in the text colour around it.
- `./define` registers every control. `./define/<control>` registers one, and `.` exports the classes and registers nothing.
- Under a bundler that sets the `development` condition, as Vite's dev server does, the controls warn in the console about a missing sheet, a padding lost to an unlayered rule, a box property set on a host, a child they do not use and a binding that found nothing. Read the console before debugging.

## What every control shares

- The host is `display: contents` and the control is an element inside it. A width, margin or transform on the host does nothing: size a control with its token (`--sonic-dial-size`, `--sonic-slider-length`), which can be set on the host or any ancestor, and place it with its parent's layout.
- Name every control with `aria-label` or `aria-labelledby` on the host, or with a `<label>` for a form-associated one; the control moves the name onto its focusable part.
- A boolean attribute is on when present, whatever its value, so `pressed="false"` latches a button. From a framework pass `undefined`, never `false`.
- A control uses only the children it documents below, and adds one child of its own. Under a hydrating framework, register the definitions once hydration is done (in React, from an effect), so the added child is no mismatch.
- Events bubble and carry no detail: read the property when one fires. A control knows nothing about playback, so wire `input` and `change` to your own state and write `value` back.
- Buttons, value controls, the segmented control, the switch, the toggle and the XY pad are form-associated: give one a `name` and it submits, resets and restores with its form.
- States a control sets itself are custom states on the host, selected with `:state()`: `dragging`, `cancelling`, `editing`, `revealed`, `springing`, `modulated`, `pressed`, `held`, `ladder`, `empty` and `pending`.

## Value controls

The dial, the slider, the number box and both wave controls hold one number, from `min` (0) to `max` (100) in steps of `step` (1).

- `input` fires as the value moves and `change` once when a gesture ends, however it ends.
- A drag owns the value: a write to `value` during one is dropped, so a seek bar fed by `timeupdate` needs no guard of its own.
- A double press, or Enter, opens typed entry. `double-press="reset"` makes it go back to `default` instead. Cmd-click on Apple platforms, Ctrl-click elsewhere, and Delete reset whichever is chosen, once `default` is set.
- `formatValue` and `parseValue` are properties holding functions. What the first writes, the second has to read, or typed entry opens on text it cannot take; `formatEntry` covers the case where it cannot.
- The readout bubble is opt-in, with `readout`. Assistive technology hears the value without it; `formatSpokenValue` words it.
- `taper="log"` gives even octaves on a range above zero, and `midpoint` bends a range that starts at zero. On a tapered control the arrow keys move by travel; `key-step` makes them move by value.
- `positions` is a property holding the numbers a stepped control stops at, spaced evenly whatever their values; their labels come from `formatValue`.
- `modulationValue` is a property only, meant to be written every frame. It moves the light and fires nothing.
- To take a key from a control, call `preventDefault()` in a capture listener.

## Press controls

A button's children are its legend, an icon or a label, always an element. They are copied into the cap, so the copy has none of your listeners and any id in it is prefixed; keep them static. A child with `data-sonic-when="pressed"` or `"released"` shows only in that state.

```html
<sonic-button aria-label="Loop" latching>
	<span class="sonic-led"></span>
	<svg aria-hidden="true">…</svg>
</sonic-button>
```

- A plain button fires `click`. `latching` makes it stay pressed, with `pressed` and a `change` event; `momentary` makes it pressed for as long as it is held, and acts on the press, not the release.
- `soft-disabled` stops presses but keeps the tab stop, for a button that would otherwise lose focus when it disables itself. `busy` leaves it pressable.
- The segmented control, the switch and the toggle take one child per position, each with `data-sonic-value`, and hold the chosen one in `value`. They fire `change` only. A switch or a toggle with no children is on or off, held in `checked`.
- On a position child, `data-sonic-disabled` locks it, `data-sonic-momentary` makes an end position spring back, and on a toggle `data-sonic-lit` lights the well there (`ok`, `warning` or `danger` for the colour). A lock stops the user, not your code: a `value` written to a disabled position is chosen.

```html
<sonic-segmented aria-label="Filter" value="lp">
	<span data-sonic-value="lp">LP</span>
	<span data-sonic-value="bp">BP</span>
	<span data-sonic-value="hp">HP</span>
</sonic-segmented>
```

## Parts that are only a class

The LED, the panel, the ring and the screen have no behaviour, so they are classes on your own elements and need no registration.

- `<span class="sonic-led">` is unlit until it carries `data-sonic-lit`, whose value picks the colour: empty, `idle`, `ok`, `warning` or `danger`. Inside a latching button or a toggle's cap it lights with the control.
- `class="sonic-ring"` draws a lit arc around its one child, from `--sonic-ring-from` to `--sonic-ring-to`, each 0 to 1. Give it your own `role="progressbar"`.
- `class="sonic-screen"` is a box of glass that holds your own text, a canvas or a control, and is sized like a `div`: it fills a block, hugs in a flex row, and is never shorter than `--sonic-screen-size`. A wave strip, waveform, spectrum, envelope or XY pad draws no glass of its own, so wrap one in a screen for the encased look; its padding is the inset, and it centres what it holds, so a control that should span it is given its length (`--sonic-wavestrip-length: 100%`). A control with `fill` needs the screen given a height.
- `class="sonic-panel"` groups controls under a `sonic-panel-title`.

## Displays

A display takes its signal as data and never opens an `AudioContext`.

- `<sonic-meter>`: write `level`, a linear peak amplitude, as often as you have one; the meter converts to decibels and applies its `ballistics`. Write `value` instead to show a number in the meter's own units exactly as given. `segments` turns the bar into a ladder. It fires nothing and has no role: read `peak`, call `resetPeak()`, and announce numbers yourself.
- `<sonic-spectrum>`: set `analyser` to an `AnalyserNode`, or call `push(decibels)` with a `Float32Array` holding one level per bin and set `sample-rate`.

## Controls that drive other controls

- `<sonic-split>` wraps value controls and keeps their values adding up to `total`. `mode` chooses who gives way (`proportional`, `equal` or `cascade`), and `data-sonic-locked` on a member holds it still. The others move a microtask after the one the user moved, so its `input` arrives first.
- `<sonic-envelope>` has no value and no events. Each of its attributes (`delay`, `attack`, `hold`, `decay`, `sustain`, `release`, and `attack-curve`, `decay-curve`, `release-curve`) names the id of a dial, a slider or a number box; dragging a handle turns that control, which fires its own `input`. Stages share the width equally, whatever their times.
- `<sonic-xy>` holds `x` and `y`, each with its own `x-min`, `x-max`, `x-step` and so on, and submits them as `name.x` and `name.y`.
- `envelopeCurve` and `crossfadeGains` are exported so your DSP computes what the control draws.

## Wave controls

`<sonic-wavestrip>` is the overview of a track, scrubbed to seek; `<sonic-waveform>` is the close-up that scrolls under a fixed playhead. Both are value controls in seconds that take their data as properties (`peaks`, `markers`); the types list the rest. `peaks` is `{ pairsPerSecond, samples }`, and the full scale follows the array unless `fullScale` is set.

A wave control shows and reads a clock (`1:23`, typed or drawn) and speaks a duration in the language around it, the nearest `lang`. Setting `formatValue`, `parseValue` or `formatSpokenValue` replaces that part; `formatClock` and `parseClock` are the same pair, exported so your own time text matches.

Their events bubble and carry no detail, so read the property when one fires: `revealed` on `sonic-reveal`, `currentMarker` on `sonic-marker`, and the strip's `hoverValue` on `sonic-hover`, which `clientXOf(value)` turns into a viewport x.

The strip draws one part per marker inside `.sonic-wavestrip-markers`, in `start` order: a `.sonic-wavestrip-marker` dot, or a `.sonic-wavestrip-region` when the marker has an `end`. Marker labels are hidden from assistive technology; fold `currentMarker` into `formatSpokenValue` to have one spoken.

The waveform parks the current marker's label in its corner and fades it after the next marker crosses the playhead, never before: `--sonic-waveform-label-fade-start` (0) and `--sonic-waveform-label-fade-end` (1) run from that crossing, 0, to the next label reaching the park, 1.

The waveform calls `requestPeaks(fromSeconds, toSeconds)` as its window moves, often every frame, so return at once for a span already loaded or on its way. Return a promise, or several, and the waveform repaints as each settles; an `async` function is the wrong shape, since it hands back a new settled promise each call. `pending` is yours to keep: list the spans being fetched, and clear each as it lands.

With `zoomable`, a ctrl or cmd wheel, a pinch and the `+` and `-` keys set the waveform's `zoom` and fire `sonic-zoom`; a write to `zoom` fires nothing.

With `fill` a control takes its container's height and its ratios follow. `--sonic-wavestrip-marker-size`, `--sonic-wavestrip-groove-size` and `--sonic-waveform-label-font-size` hold an absolute length instead.

## Skinning

A skin is one rule that sets tokens on a class; copy `dist/skins/flat.css` to start one. Tokens, hook classes (`.sonic-dial`, `.sonic-wavestrip-marker`), `data-sonic-*` attributes and states are the public surface. Anything starting `--_sonic-` is private and changes without notice.

- Set tokens, not rules on hook classes. If a look needs a hook-class rule, a token is missing.
- Most geometry tokens end in `-ratio` and are a unitless share of the control's size, so one size token scales the whole control.
- A length token takes any CSS length except a percentage. For a fluid size use container units.
- `--sonic-relief` runs from 0, flat, to 1, and scales every bevel and shadow at once. `--sonic-light-tilt` turns the one light they all follow.
- `--sonic-target-size` widens the region that takes a press past the control's box. It is unset by default.

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
| `envelope.css`  | core, glass, readout, bracket                   |
| `led.css`       | core, lens                                      |
| `meter.css`     | core, lens, groove                              |
| `number.css`    | core, cap, glass, pane, well, value             |
| `panel.css`     | core                                            |
| `ring.css`      | core, arc                                       |
| `screen.css`    | core, glass, pane, well                         |
| `segmented.css` | core, cap, well, keycap                         |
| `slider.css`    | core, cap, glass, readout, value, groove, scale |
| `spectrum.css`  | core                                            |
| `switch.css`    | core, cap                                       |
| `toggle.css`    | core, cap, well, keycap                         |
| `waveform.css`  | core, cap, glass, readout, value                |
| `wavestrip.css` | core, cap, glass, readout, value                |
| `xy.css`        | core, cap, glass, readout, bracket              |

An LED inside a control also needs `led.css`, and a button inside a ring needs `button.css`.

Targets current Chrome and Edge, Safari 26 and Firefox 147. No control mirrors for right-to-left. MIT licensed.
