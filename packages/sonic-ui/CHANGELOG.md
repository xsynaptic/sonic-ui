# @xsynaptic/sonic-ui

## 0.22.0

### Minor Changes

- - `--sonic-entry-selection` colours the selected text of a typed entry, which opens with its value selected. Unset, it stays the control's lit colour.
  - `--sonic-slider-groove-hover-delay` is how long a slider's groove waits under a pointer before it thickens to `--sonic-slider-groove-hover-ratio`. A press or a keyboard focus thickens it at once and leaving thins it at once. Unset, there is no wait.
  - `--sonic-readout-depth` scales a readout's cast shadow, inner shine and lighter centre from 0 to 1. Unset, it follows the relief.
  - Behaviour change: a readout no longer takes `--sonic-glass-depth` from a screen around it. Inside a screen flattened with `--sonic-glass-depth: 0` its centre follows the relief again, as its shadow always did; set `--sonic-readout-depth: 0` to flatten it.

## 0.21.0

### Minor Changes

- - Breaking: the number box is plain: its digits alone in the text colour, with no glass, edge or corner. Wrap it in `.sonic-screen` for the box (`--sonic-screen-size` set to the number's size and `--sonic-screen-inset-ratio: 0` gives the old one). `--sonic-number-radius-ratio` and `--sonic-number-inset-ratio` are removed, `--sonic-radius` and the glass tokens no longer reach it, and `number.css` needs only the core, cap and value material sheets.
  - With no skin a meter no longer draws a near-black bar: its bed is clear and its unlit segments are a faint tint of the text colour, like the LED. Skins are unchanged.
  - A screen now shrinks in a flex row; give one that holds a text readout a `min-inline-size`.
  - A button sets `user-select: none`, as every other control does, so a text legend no longer selects under a long press on touch.
  - A held XY puck stays solid, as a held envelope handle does; the hold shows as the glow, or as the bracket on a skin with no relief. It no longer turns hollow.
  - `--sonic-focus-radius` rounds the focus outline and glow of the plain boxes (number box, waveform, wave strip), which have no corner of their own. Unset, they stay square.
- - With no skin, every unlit part follows the text colour at 30%, as the LED and the meter did: a dial's ring, a slider's groove, the ring, the pad's lines, the wave strip. Glass, a disabled envelope handle and a disabled puck stay solid. Skins are unchanged.
  - Tokens: `--sonic-touch-action` reaches the dial and the number box, so one set on a wrapper for a slider now reaches dials inside it. `--sonic-radius` reaches every readout; `--sonic-readout-radius-ratio` is new and wins when set. `--sonic-focus-radius` also rounds the focus of a slider and a switch position.
  - Focus: a visible `--sonic-focus-outline` is drawn on the cap of a button, a segmented option and a dial, where the cap covered it.
  - Waveform: a repeating key scrubs, as on the wave strip: `input` on each repeat and one `change` on keyup.
  - Split: `disabled` freezes the members against gestures; a written `value` still lands.
  - XY pad: `double-press="reset"` (default `none`), `:state(revealed)`, `dragging` and `revealed` getters, and `sonic-reveal`. A form reset during a drag is dropped.
  - Toggle: a press that slides a few pixels is still a press. A coloured lit toggle takes system colours in forced colours.
  - Button and switch: a key prevented in a capture listener no longer holds a momentary button, a bat press let go off the switch is cancelled, and an LED in a disabled latched button or option dims where it stayed lit.
  - Screen: its text can be selected (a screen that is itself a button sets its own `user-select`), and its `--sonic-glass-depth` no longer flattens the well of a button inside it.
  - The keycap sheen follows `--sonic-light-tilt`.

## 0.20.0

### Minor Changes

- - Breaking: the wave strip, waveform, spectrum, envelope and XY pad draw no glass. Each is plain, in the text colour around it, with no fill, edge or corner. For the encased look wrap one in `<div class="sonic-screen">`, whose padding is the inset.
  - Breaking: `.sonic-screen` is sized like a `div`. It fills a block, hugs in a flex row and is never shorter than `--sonic-screen-size`; `--sonic-screen-aspect-ratio` is removed, so a text readout sets its own width. A control with `fill` needs the screen given a height.
  - Removed tokens: `--sonic-wavestrip-inset-ratio`, `--sonic-waveform-inset-ratio`, `--sonic-spectrum-inset-ratio`, `--sonic-xy-inset-ratio`, and the `-radius-ratio` of the wave strip, waveform, spectrum, envelope and XY pad. `--sonic-radius` no longer reaches those five, and `--sonic-glass` with its depth, texture, edge, text and font reaches only the screen, the number box and the readouts. The four relief skins drop their wave strip inset.
  - New token: `--sonic-wavestrip-marker-edge` colours the ring round a marker, which is clear when unset. A held puck and the gap in its focus ring are clear too, and the pad's lines stop at the puck. A held or disabled envelope handle is filled in its ring's colour.
  - A plain control takes its colour from `color`, where it took `--sonic-glass-text`, and its canvas repaints when `color` changes. It ignores `--sonic-ink`, as before.
  - With no token set: the XY pad and the spectrum lose their default insets (0.04 and 0.06), a wave strip's regions stop at the wave's height, and a screen's well takes the full depth where the waveform's took 0.6.
  - `spectrum.css` needs only `material/core.css`; the envelope, waveform, wave strip and XY pad sheets no longer need `pane` or `well`. Importing sheets one by one, the glass comes back with `screen.css` and `material/glass.css`, `pane.css` and `well.css`.

### Patch Changes

- - Development warnings name a control's own sheet and `material/core.css` when missing, and no longer any other material sheet; the README table lists what each sheet needs.

## 0.19.0

### Minor Changes

- - Shared tokens, each unset or at today's value: `--sonic-press-duration` (60ms) and `--sonic-fade-duration` (120ms) time a cap's press and every fade; `--sonic-shade` (black) and `--sonic-shine` (white) are the poles the light mixes a surface towards.
  - `--sonic-legend-font-size` sets the text of a button, a segmented option, a switch and a toggle. `--sonic-radius` sets the outer corner of a button, a segmented control, a number box, a screen, a slider's cap, a wave strip, a waveform, a spectrum, an envelope and an XY pad. A control's own `-font-ratio` or `-radius-ratio` still wins, and under the shared radius a button's face follows its corner.
  - Waveform and wave strip: the inset ratio now defaults to 0, so the wave fills its glass; set `--sonic-waveform-inset-ratio: 0.06` or `--sonic-wavestrip-inset-ratio: 0.1` for the inset each had. The slate, amber, ivory and lime skins keep the wave strip's 0.1, which holds its markers clear of the well's shadow.
  - Spectrum and wave strip: the canvas is rounded to the glass, so a large radius no longer leaves corners poking out.
  - A cast shadow or highlight now computes to `color(srgb …)` where it was `rgba()`; nothing drawn changes.
  - In development a control warns about a box property on its host, a padding zeroed by an unlayered rule, and a missing `material/scale.css` or `material/bracket.css`. The README has the recipe for layering a reset.
- - A waveform or a wave strip now shows, reads and speaks a clock when no formatter is set: `1:23` in the readout and the typed entry, and a duration in the nearest `lang` for assistive technology. Setting `formatValue`, `parseValue` or `formatSpokenValue` replaces that part.
  - `formatClock` and `parseClock` are exported, so your own time text can match. A negative time is written with `−` (U+2212), not the ASCII hyphen; `parseClock` reads either.
  - `fullScale` is optional on `peaks` and follows the array when unset.
  - `./dat` is removed. Pass `peaks` as `{ pairsPerSecond, samples }`, where the first is a header's `sampleRate / samplesPerPixel`.

## 0.18.0

### Minor Changes

- - Button: an icon keeps its `viewBox` proportions at `--sonic-button-icon-ratio` of the button's height, and the button widens to fit it, never under `--sonic-button-aspect-ratio`; at 0 the button is as wide as its icon. Breaking for an icon wider than it is tall, which was shrunk into a square.
  - Waveform: a dimmed marker's label dims by opacity, so `renderLabel` children with their own colour dim too, as does the label's scrim. Drop any rule that dimmed them by hand.

### Patch Changes

- Internals restructured into smaller modules; no change to the public surface.
- Switch and toggle internals restructured around position indices; no change to the public surface.
- The types say the unit or the contract on the properties whose type alone does not, such as a meter's `level` and a waveform's `zoom`.

## 0.17.0

### Minor Changes

- - Waveform: `renderLabel(marker, element)` draws a marker's label in place of its text. A marker keeps a consumer's own keys for it to draw from.
  - Waveform: `--sonic-waveform-label-fade-start` (0) and `--sonic-waveform-label-fade-end` (1) replace `--sonic-waveform-label-fade-ratio`. They place the parked label's fade between the next marker crossing the playhead, 0, and its label reaching the park, 1; equal values give no fade. By default the label now holds until the crossing and is gone as the next one lands.

## 0.16.0

### Minor Changes

- - Button: a text legend widens the button to fit, never under `--sonic-button-aspect-ratio`. `--sonic-button-font-ratio` (0.34) and `--sonic-button-padding-ratio` (0.25) size it, replacing a font size set on the host, and it takes an icon's engraving and lit glow.
  - Segmented: `--sonic-segmented-padding-ratio` (0.25) sets an option's inline padding.
- - Button and segmented: `--sonic-button-latched-scale` and `--sonic-segmented-latched-scale` scale a cap that stays down; unset, the press scale. A press still dips.
  - Focus: `--sonic-focus-glow` scales the glow, 0 to 1; `--sonic-focus-outline` and `--sonic-focus-outline-offset` draw an outline on keyboard focus.
  - Disabled: `--sonic-disabled-opacity` fades a disabled control.

## 0.15.0

### Minor Changes

- - Slider: `--sonic-target-size` now extends a slider's target across its breadth, so a page that already sets it gives its sliders more reach.
  - Value controls: `entry="none"` turns typed entry off. With `spoken-step`, `formatSpokenValue` receives the rounded value that `aria-valuenow` carries.
  - Button: a button with `expanded="true"` is drawn as a pressed one. `--sonic-ink-disabled` colours a disabled control's legend, label, digits and indicator.
  - Waveform: a trackpad pinch in Safari zooms a `zoomable` waveform.

## 0.14.0

### Minor Changes

- Slider: three tokens for a capless progress strip. `--sonic-slider-groove-radius-ratio` rounds the groove's ends as a ratio of its thickness (0.5 by default; at 0 a capless groove is exactly the control's length and its fills stop at their proportions of it). `--sonic-slider-groove-anchor` places the groove across the breadth, 0 at the start, 0.5 by default, 1 at the end, so a thickening groove grows one way. `--sonic-slider-indicator` colours the indicator line apart from the ink.

## 0.13.0

### Minor Changes

- The material is split into sheets under `material/*.css`, so you can load only what your controls need; the README lists them. `material.css` and `controls.css` work as before, and sheets now load in any order.

  New public surface: the material sheets, and the sublayers `sonic.material` and `sonic.control`. A rule written directly in `@layer sonic` now always wins over the control sheets.

- Waveform: `zoomable` opts in to zoom by ctrl or cmd wheel, two-finger pinch and the `+` and `-` keys, between `zoom-min` and `zoom-max` (20 and 280 by default). `sonic-zoom` fires for a gesture and never for a write to `zoom`. A second finger ends a scrub without a seek. Without `zoomable` nothing changes.

## 0.12.0

### Minor Changes

- Wave controls: `requestPeaks` may return one promise or an iterable of them, each repainting once however often it is returned, and its `PeaksRequest` type is exported. A write to `pending` or `peaks` inside the call no longer asks again for the same window, and `pending` ignores an unchanged list. The waveform now asks when its window moves, its data is written or a promise settles, not on every repaint. `<sonic-wavestrip>` gains `clientXOf(value)`, the viewport x where a value sits.

## 0.11.0

### Minor Changes

- - Breaking: lit colours take status names. `data-sonic-lit` values `alt`, `hot`, `clip` and `dim` are now `ok`, `warning`, `danger` and `idle`; `--sonic-lit-alt`, `--sonic-hot` and `--sonic-clip` are now `--sonic-lit-ok`, `--sonic-lit-warning` and `--sonic-lit-danger`. A meter's and a spectrum's hot and clip zones keep their names and draw in the warning and danger colours.
  - Toggle: new `<sonic-toggle>`, a round cap sliding in a well, two or three positions or on/off, with lit, momentary and disabled positions and an optional LED or icon on the cap.
  - Segmented control and switch: `data-sonic-disabled` on a position child disables that one position; arrows skip it, a press and the bat pass it by. A disabled switch position's label is drawn faint, which also dims the labels of a wholly disabled switch.
  - Switch: a press on the rest label of a two-position switch holds its momentary position instead of latching it.
  - Button and segmented control: a held Space shows the press in Firefox. `data-sonic-pressed` marks a part held by a key as well as by a pointer.
  - Segmented control: on a skin whose ink is dark the chosen legend is drawn in the ink, so it reads on a light cap; the lit well still marks the choice.

## 0.10.4

### Patch Changes

- - Value controls: `dragging`, `revealed` and `cancelling` read the states of the same names as properties, so script need not match `:state()`.
  - Waveform: every promise `requestPeaks` returns repaints as it settles, not only the latest; connecting no longer throws where `document.fonts` is missing.
  - Wave strip: `--sonic-wavestrip-groove-size`, a length, overrides `--sonic-wavestrip-groove-ratio` so the empty groove keeps its thickness on a `fill` strip.
  - Waveform: `--sonic-waveform-label-font-size`, a length, overrides `--sonic-waveform-label-font-ratio`; `--sonic-waveform-label-line-height` sets the label's line height.
  - Wave strip: the marker band holds one part per marker in the order `markers` reads back; the README now lists what the wave controls make public.

## 0.10.3

### Patch Changes

- - Value controls: a release outside the control fires no `sonic-hover`, and `pointerType` holds through the `change` of a release, a tap or a reset press.
  - XY pad: `:state(dragging)` is set before a press's first `input`.
  - XY pad and envelope: `pointerType`, as on value controls.

## 0.10.2

### Patch Changes

- - Wave strip: a drag held past the cancel zone stays at its start again; 0.10.1 let it seek.
  - Value controls: `pointerType` is set by a press's first `input`, and `hoverValue` returns under a still mouse when a key reveal lapses.
  - Wave strip: marker dots are in the DOM in ascending `start` order, regions apart.
  - `CHANGELOG.md` ships in the package, and `sonic-hover`, `sonic-reveal` and `sonic-marker` are typed on `addEventListener`.

## 0.10.1

### Patch Changes

- Value controls: `hoverValue` returns on release, `:state(revealed)` covers a key reveal, and `dragging` and `revealed` are set before the `input` they describe.

## 0.10.0

### Minor Changes

- - Value controls: `formatEntry`, a function, sets the text the entry opens with, so a unit can stay out of what is typed.
  - Switch: the shaft stays planted at the bushing while the bat is thrown, and a disabled switch is one opaque colour.
  - Wave strip: a marker's dot is opaque.
  - Relief skins: a softer glow on lit caps, legends, LEDs and a held XY puck; a shallower well on the waveform's glass.
  - Edges: rims, outlines and hairlines snap to the device pixel grid, so an edge keeps one weight around a control at any size.
- - Glass: `--sonic-glass-edge-width`, a length, sets the edge's width on every glass part; at 0 a flat control's canvas is its own box. Forced colours keep a 1px edge. `--sonic-readout-edge` and `--sonic-readout-edge-width` set a readout's edge apart from its control's.
  - Value controls: `hoverValue` and a `sonic-hover` event report the value under a hovering mouse on the wave strip and a `scrub` slider, with or without `readout`; a marker's start over its dot, `undefined` when nothing is hovered.
  - Wave strip: `--sonic-wavestrip-marker-edge-width` and `--sonic-wavestrip-region-edge-width`, lengths, hold a dot's edge (and so the lane step) and a region's lines still on a `fill` strip.
  - Waveform: `--sonic-waveform-scrim`, a background across the wave under the labels, on the new hook class `sonic-waveform-scrim`; `--sonic-waveform-label-inset-block`, a length, sets a label's block inset.
  - Spectrum: `fill`, as on the wave controls.

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
