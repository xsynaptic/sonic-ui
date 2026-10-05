# @xsynaptic/sonic-ui

## 0.9.0

### Minor Changes

- - Waveform: `currentMarker` and `sonic-marker` follow `value` and `markers` while the waveform is out of view or has not yet painted.
  - Waveform: `--sonic-waveform-label-inset-inline`, a length (so it can hold `env(safe-area-inset-left)`), sets how far from the wave's edge a label parks. Unset, it follows `--sonic-waveform-label-inset-ratio` as before, which still sets the label's block inset and its gap from its marker's line.
  - Wave strip: `--sonic-wavestrip-marker-size`, a length, overrides `--sonic-wavestrip-marker-ratio` so dots keep one size on a `fill` strip; lanes and the snap reach follow it.
  - Value controls: `double-press="none"` makes a double press do nothing (Enter still opens the entry), and `--sonic-reveal-delay` sets how long a still press waits before the reveal (250ms by default).

## 0.8.1

### Patch Changes

- `--sonic-meter-length` takes a percentage, as the other length tokens do; `.sonic-meter` is now a size container.

## 0.8.0

### Minor Changes

- - Waveform: tokens for the playhead, grid, ends, placeholder, ghost and labels; `reduced-motion="scroll"`, `pending-delay`, and a `requestPeaks` that may return a promise.
  - Wave controls: `fill`, `currentMarker` with a `sonic-marker` event, a plain groove on an empty wave strip, and a strip readout that stays inside the strip.
  - Value controls: `:state(revealed)` with a `sonic-reveal` event, `:state(cancelling)`, `pointerType`, `spoken-step`, `--sonic-touch-action` and `--sonic-readout-text`; an empty `formatValue` string hides the readout.
  - Slider: `scrub` and `--sonic-slider-groove-hover-ratio`. Button: `expanded`, `controls`, `popup`, `legend` and `--sonic-button-busy-delay`.
  - `WaveMarker` and `TimeRegions` are exported.

## 0.7.0

### Minor Changes

- - `<sonic-spectrum>` draws level against log frequency on glass: set `analyser` to an `AnalyserNode`, or `push()` a frame of decibels per bin. `peak` and `resetPeak()` report the loudest bin.
  - New tokens: `--sonic-spectrum-size`, `--sonic-spectrum-length`, `--sonic-spectrum-inset-ratio`, `--sonic-spectrum-radius-ratio`, `--sonic-spectrum-hot-from` and `--sonic-spectrum-clip-from`. New hook classes: `sonic-spectrum` and `sonic-spectrum-canvas`.

## 0.6.1

### Patch Changes

- - `--sonic-scale` colours a scale's ticks, and `--sonic-panel-text` the text on a panel.
  - The number box, waveform, wavestrip and XY pad draw in `--sonic-glass-text`, no longer `--sonic-ink`.
  - `--sonic-well` also colours the switch's bushing.
  - The glass warp is gone, and glass with no depth is one flat colour.
  - The held bracket moves to the hook classes `sonic-xy-bracket` and `sonic-envelope-bracket`.
- - A readout stays on one line, and `--sonic-readout-glass` colours it.
  - `buffered` is on the slider and the wave strip only.
  - `tabindex="-1"` on a value control's host removes its tab stop.
- - A bare button with no legend draws a faint edge in the text colour; `--sonic-cap-edge: transparent` removes it.
  - A bare unlit LED is a tint of the text colour, with no bezel.
  - Bare glass follows the colour scheme and has an edge; glass text follows the glass's lightness.

## 0.6.0

### Minor Changes

- Breaking: a control with no skin is now bare; the former default look is the `amber` skin, and `flat` is new. `--sonic-relief` scales depth and glow, and new tokens cover edges, wells, hover colours and `--sonic-target-size`.

  Reworked XY puck, envelope handles, wavestrip markers and readout, and dial scale labels.

  Controls put their control back when a morph removes it, warn in development about children they do not document, and take number properties as strings. Under a hydrating framework, register the definitions after hydration.

  Controls draw once on connect and write the DOM only where something changed.

## 0.5.0

### Minor Changes

- Six new controls: `<sonic-switch>`, `<sonic-xy>`, `<sonic-envelope>`, `<sonic-split>`, `<sonic-wavestrip>` and `<sonic-waveform>`, along with `.sonic-panel`, `.sonic-ring` and a `./dat` reader for audiowaveform files.

  Breaking: names were brought into one vocabulary, with no aliases. `<sonic-key>` is now `<sonic-button>`, `toggle` is `latching`, `values` is `positions`, and several hook classes and tokens were renamed to match.

  The existing controls picked up markers, buffered regions, modulation, meter ballistics and a screen texture on glass, plus a round of fixes to stepping, dragging and focus.

## 0.4.0

### Minor Changes

- Scale legends on the dial and slider, `values` and `detent` on the range controls, `spring` and `buffered` on the slider, `origin`, `scale="linear"` and `lights` on the meter, `busy` and `soft-disabled` on the key, and a second LED colour. The dial and slider now render through a shadow root with one slot.

## 0.3.0

### Minor Changes

- `--sonic-glass-text` and `--sonic-glass-font` set the text colour and font on both readouts, `.sonic-number` and `.sonic-screen`.
- `<sonic-number>`, `.sonic-led`, `endless` on the dial and `modulation` on the slider.

### Patch Changes

- Length tokens accept any CSS length; `--sonic-readout-size` now applies from the control or an ancestor, not the readout.

## 0.2.0

### Minor Changes

- Form association, reflected properties, forced-colours support, percent formatting helpers, framework-safe children, a draggable switch press and a warmer ivory skin.

## 0.1.0

### Minor Changes

- Initial release: `<sonic-dial>`, `<sonic-slider>`, `<sonic-key>`, `<sonic-segmented>` and `<sonic-meter>` as light-DOM custom elements, the `.sonic-screen` class, and the slate, lime and ivory skins.
