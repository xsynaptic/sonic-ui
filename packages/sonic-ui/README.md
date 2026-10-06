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

## Wave controls

`<sonic-wavestrip>` is the overview of a track, scrubbed to seek; `<sonic-waveform>` is the close-up that scrolls under a fixed playhead. Both are value controls in seconds that take their data as properties (`peaks`, `markers`); the types list the rest.

Their events bubble and carry no detail, so read the property when one fires: `revealed` on `sonic-reveal`, `currentMarker` on `sonic-marker`, and the strip's `hoverValue` on `sonic-hover`.

The strip draws one part per marker inside `.sonic-wavestrip-markers`, in `start` order: a `.sonic-wavestrip-marker` dot, or a `.sonic-wavestrip-region` when the marker has an `end`. Marker labels are hidden from assistive technology; fold `currentMarker` into `formatSpokenValue` to have one spoken.

The waveform calls `requestPeaks(fromSeconds, toSeconds)` as its window moves, often every frame, so return at once for a span already loaded or on its way. Return a promise while a fetch is out and the waveform repaints when it settles. `pending` is yours to keep: list the spans being fetched, and clear each as it lands.

With `fill` a control takes its container's height and its ratios follow. `--sonic-wavestrip-marker-size`, `--sonic-wavestrip-groove-size` and `--sonic-waveform-label-font-size` hold an absolute length instead.

Targets current Chrome and Edge, Safari 26 and Firefox 147. MIT licensed.
