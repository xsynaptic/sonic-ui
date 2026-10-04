# @xsynaptic/sonic-ui

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
