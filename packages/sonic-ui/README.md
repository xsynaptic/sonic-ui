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
| `envelope.css`  | core, glass, pane, well, readout, bracket       |
| `led.css`       | core, lens                                      |
| `meter.css`     | core, lens, groove                              |
| `number.css`    | core, cap, glass, pane, well, value             |
| `panel.css`     | core                                            |
| `ring.css`      | core, arc                                       |
| `screen.css`    | core, glass, pane, well                         |
| `segmented.css` | core, cap, well, keycap                         |
| `slider.css`    | core, cap, glass, readout, value, groove, scale |
| `spectrum.css`  | core, glass, pane, well                         |
| `switch.css`    | core, cap                                       |
| `toggle.css`    | core, cap, well, keycap                         |
| `waveform.css`  | core, cap, glass, pane, well, readout, value    |
| `wavestrip.css` | core, cap, glass, pane, well, readout, value    |
| `xy.css`        | core, cap, glass, pane, well, readout, bracket  |

An LED inside a control also needs `led.css`, and a button inside a ring needs `button.css`. The development build warns about a missing sheet.

## Wave controls

`<sonic-wavestrip>` is the overview of a track, scrubbed to seek; `<sonic-waveform>` is the close-up that scrolls under a fixed playhead. Both are value controls in seconds that take their data as properties (`peaks`, `markers`); the types list the rest.

Their events bubble and carry no detail, so read the property when one fires: `revealed` on `sonic-reveal`, `currentMarker` on `sonic-marker`, and the strip's `hoverValue` on `sonic-hover`, which `clientXOf(value)` turns into a viewport x.

The strip draws one part per marker inside `.sonic-wavestrip-markers`, in `start` order: a `.sonic-wavestrip-marker` dot, or a `.sonic-wavestrip-region` when the marker has an `end`. Marker labels are hidden from assistive technology; fold `currentMarker` into `formatSpokenValue` to have one spoken.

The waveform calls `requestPeaks(fromSeconds, toSeconds)` as its window moves, often every frame, so return at once for a span already loaded or on its way. Return a promise, or several, and the waveform repaints as each settles; an `async` function is the wrong shape, since it hands back a new settled promise each call. `pending` is yours to keep: list the spans being fetched, and clear each as it lands.

With `zoomable`, a ctrl or cmd wheel, a pinch and the `+` and `-` keys set the waveform's `zoom` and fire `sonic-zoom`; a write to `zoom` fires nothing.

With `fill` a control takes its container's height and its ratios follow. `--sonic-wavestrip-marker-size`, `--sonic-wavestrip-groove-size` and `--sonic-waveform-label-font-size` hold an absolute length instead.

Targets current Chrome and Edge, Safari 26 and Firefox 147. MIT licensed.
