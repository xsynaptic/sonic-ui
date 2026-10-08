# sonic-ui

The words this library uses for its controls, their parts and their values. Where studio hardware has a name for something we use it; otherwise we use the word a web developer would look for. Each word means one thing.

## Language

### Categories

**Control**: Anything the user operates to set a value. _Avoid_: Widget, component, element (the custom element that implements one)

**Display**: Anything that shows a signal or a state and takes no input, such as a meter, an LED or a screen. _Avoid_: Monitor, readout

**Value control**: A control that holds one number between a minimum and a maximum. _Avoid_: Range control, range element

### Controls

**Button**: A control that is pressed. It is either momentary or latching. _Avoid_: Key, pad, toggle (that is the control below)

**Switch**: A control with a bat handle that tilts between two or three positions. _Avoid_: Lever, toggle (that is the control below)

**Toggle**: A control whose round cap slides in a well between two or three positions. _Avoid_: Slide switch (one letter from the slider), "toggle" for a button, a switch or latching

**Dial**: A value control that turns. The word covers the whole thing: cap, indicator, ring and scale. _Avoid_: Knob (on hardware that is only the cap), rotary, pot

**Slider**: A value control whose cap slides along a groove. _Avoid_: Fader (one use of a slider), range input

**Number box**: A value control shown as digits. It is dragged, stepped or typed into. _Avoid_: Spinner, stepper, value field

**Segmented**: A row of joined caps, one of which is always chosen. _Avoid_: Selector, radio group, button bank

**XY pad**: A control that sets two values at once by moving a puck around a field. _Avoid_: Plane, joystick, touchpad

**Split**: A group of value controls whose values always add up to the same total. _Avoid_: Sum, link, blend, balance

**Envelope**: A graph of an envelope's stages. Dragging its handles turns the dials that hold each stage's value. _Avoid_: ADSR (one shape of envelope), envelope editor

**Key**: A key on a piano keyboard or a computer keyboard. _Avoid_: "key" for a button

### Displays

**Meter**: A display of signal level, drawn as a bar or a ladder. _Avoid_: Bargraph, VU (one kind of ballistics)

**LED**: A single lamp that is lit, idle or unlit. _Avoid_: Light, lamp, indicator

**Screen**: A box of glass that holds text, graphics or a control. _Avoid_: Display (the category), LCD

**Panel**: A titled section that groups related controls and displays. _Avoid_: Plate, faceplate, card, surface

**Waveform**: The close-up view of a wave, which scrolls under a fixed playhead. _Avoid_: Detail view, scrolling waveform

**Spectrum**: A display of level against frequency, drawn as one filled shape that rises at once and falls at a set rate. _Avoid_: Analyser (the node that feeds it), FFT, spectrograph

**Wavestrip**: The overview of a whole track, drawn as bars and scrubbed to seek. _Avoid_: Overview waveform, stripe, seek bar

### Parts

**Cap**: The part of a control that the hand moves. On a dial it is the knob, on a slider the handle, on a button the face. _Avoid_: Thumb, knob, handle

**Legend**: What is printed on the cap of a button or a toggle: an icon or a label, always an element. A cap with no legend is blank; an LED is not a legend. _Avoid_: Label (that is the accessible name), glyph, icon (one kind of legend)

**Indicator**: The line on a cap that shows where it is set. _Avoid_: Pointer (that is the mouse, pen or finger), index, marker

**Groove**: The slot a slider's cap runs in. _Avoid_: Track, slot, rail

**Ring**: A lit arc. Around a dial it shows the value; around a button it shows progress. _Avoid_: Halo, arc

**Dot**: The short lit arc on an endless dial's ring that marks its value. _Avoid_: Segment, spot

**Scale**: The ticks and labels printed beside a dial or slider. _Avoid_: Legend, graduations; "scale" for the mapping or for a meter's units

**Notch**: The mark etched at each position of a stepped control. _Avoid_: Detent, tick (ticks belong to a scale)

**Edge**: The line that sets a part off from what is behind it. _Avoid_: Rim, outline, border

**Well**: The recess a button or an option sits in, or a toggle's cap slides in. _Avoid_: Socket, floor, pocket

**Bezel**: The surface that houses a light, such as a meter's bed or an LED's surround. _Avoid_: Bed, surround, housing

**Lens**: The glass of a light, lit or not. _Avoid_: Bulb, dome

**Bat**: The handle of a switch. _Avoid_: Lever, toggle, stick

**Bushing**: The collar that a switch's bat pivots in. _Avoid_: Nut, base

**Option**: One of the choices in a segmented control. It is stepped through by the same rules as a position. _Avoid_: Segment, item

**Field**: The area an XY pad's puck moves in. _Avoid_: Plane, pad, surface

**Puck**: The part of an XY pad that is dragged. _Avoid_: Thumb, cursor, handle

**Bar**: The lit column of a meter. _Avoid_: Level (that is an input), fill

**Segment**: One light in a meter's ladder. _Avoid_: Light, step, LED

**Ladder**: A meter drawn as separate segments, each with its own threshold. _Avoid_: LED strip, stepped meter

**Bracket**: The pair of arcs round a held puck or handle on a skin with no relief. _Avoid_: Ring (that is a lit arc), halo

**Readout**: The bubble that shows a control's value while it is being moved. _Avoid_: Tooltip, value label

**Entry**: The text field in a readout where a value is typed. _Avoid_: Input, edit box

### Envelope

**Stage**: One leg of an envelope. The stages are delay, attack, hold, decay, sustain and release. _Avoid_: Phase, segment

**Handle**: A point on an envelope that is dragged to set a stage's time or level. _Avoid_: Point, node, breakpoint

**Curve**: How far a stage bows away from a straight line. Each curved stage has a second handle, halfway along, that sets it. _Avoid_: Bend, dot, tension, slope

### Waves

**Peaks**: The amplitude summary, worked out ahead of time, that a wave control draws. Bands sit beside them and colour what they draw. _Avoid_: Data, samples, waveform data

**Band**: One of the frequency ranges a wave's levels are split into, with a level per band per frame. _Avoid_: Bin (one frequency of a spectrum), zone (a stretch of a level display)

**Normalize**: To scale a band mix so that its strongest channel is at full, as peak normalising does a signal. `--sonic-waveform-band-normalize` sets how far: at 0 the mix is the weighted average of the band colours and stays inside the palette, at 1 it is fully normalized. _Avoid_: Lift (in grading that raises the shadows), brighten, boost; "normalized" for a proportion

**Contrast** (of bands): The exponent on each band's weight in the mix. Above 1 the strongest band takes more of the colour. _Avoid_: Gamma, sharpness, separation

**Tilt** (of bands): A gain that rises steadily from the lowest band to the highest, in decibels a band. The light's tilt (`--sonic-light-tilt`) is an angle and another thing. _Avoid_: Slope (a filter's steepness), gain (one level), emphasis

**Playhead**: The line that marks the current time on a wave. _Avoid_: Cursor, needle

**Ghost**: The faint line that shows where playback really is while the playhead is being held. _Avoid_: Play cursor, echo

**Marker**: A labelled point or region on a wave. _Avoid_: Cue (a cue is one kind of marker, and the consumer's word), mark

**Region**: A stretch of a wave with a start and an end. _Avoid_: Span, range, interval

**Lane**: One of the rows that point markers stack in when they sit too close to share one. _Avoid_: Row, track, tier

**Scrub**: To drag along a wave, or along a slider that seeks, looking for a place to seek to. _Avoid_: Seek (the jump itself), drag

### Values

**Default**: The value a value control goes back to when it is reset. _Avoid_: Reset value, initial value

**Origin**: The value that a control's light starts from. _Avoid_: Rest, bipolar center, zero

**Detent**: A single value that a control catches on as it passes. _Avoid_: Snap, notch; "detent" for every stop of a stepped control

**Position**: One of the fixed settings of a switch, a toggle or a stepped value control. _Avoid_: Step, stop, entry; "position" for a point along continuous travel

**Proportion**: How far along its travel a value sits, from 0 at one end to 1 at the other. _Avoid_: Place, unit, normalized value

**Mapping**: The rule that turns a value into a proportion and back, including where the value snaps. _Avoid_: Scale, range

**Value model**: What a value control holds behind its drawing: the value, the value last asked for, its mapping and any limit put on it. _Avoid_: Cell, asked value, state (that is a skin's)

**Taper**: The shape of a mapping, linear or logarithmic. _Avoid_: Law, skew, easing

**Midpoint**: The value that sits halfway along the travel. Setting it bends the taper to fit. _Avoid_: Skew, center

**Modulation**: How far a modulation source can push a control's value to either side of where it is set. _Avoid_: Modulation depth, amount

**Modulation value**: Where the value is at this moment, with modulation applied. _Avoid_: Modulated, modulated value

**Clock**: A time written as minutes and seconds, with hours once it passes one. _Avoid_: Timecode, timestamp, duration (that is the spoken form)

**Level**: A meter reading given as a signal amplitude. The meter shows it in decibels and applies ballistics. _Avoid_: dB scale

**Value** (of a meter): A meter reading given in the meter's own units, shown exactly as given. _Avoid_: Linear scale, raw level

**Bin**: One of the evenly spaced frequencies in a frame given to a spectrum, each with a level in decibels. _Avoid_: Band (a filter's), bucket, sample

**Zone**: A stretch of a level display's range with its own colour: lit, then hot, then clip. The hot zone is drawn in the warning colour and the clip zone in the danger colour. _Avoid_: Warning zone, danger zone, Band, region (that is a stretch of a wave), range

**Ballistics**: How quickly a meter's bar or a spectrum's bins rise and fall, following a metering standard. _Avoid_: Response, smoothing

### Behaviour

**Press**: A pointer or a key going down on a control. _Avoid_: Click, tap

**Momentary**: Pressed only for as long as it is held. _Avoid_: Kick, gate

**Latching**: Staying pressed after release, until pressed again. _Avoid_: Toggle, sticky

**Armed**: Dimly lit, to show that a button is set and ready but not yet active. _Avoid_: Standby, loaded

**Endless**: Turning with no end stops, so the value wraps from maximum round to minimum. _Avoid_: Wrapping, infinite, encoder

**Spring**: Going back to the origin when let go. _Avoid_: Sprung, snap-back, self-centering

### Skinning

**Skin**: A stylesheet that restyles every control by setting tokens. With no skin a control is bare: no cap and no well, so a press control is its legend alone, or its edge when it has none, in the text colour around it. _Avoid_: Theme, preset

**Token**: A public custom property that a skin may set. _Avoid_: Variable, custom property (that is the mechanism)

**Hook class**: A public class on one of a control's drawn parts. _Avoid_: Part, slot, BEM element

**State**: A public custom state that a skin may select on, such as dragging or pressed. _Avoid_: Mode, status

**Lit colour**: The colour a lamp shows, named for what it reports: lit (the skin's one light), ok, warning or danger. Idle is lit at a lower level. _Avoid_: Alt, secondary, accent, a colour's own name (green, red); hot and clip on a lamp (those are a meter's zones)

**Ink**: The colour of anything printed or etched, such as scales, labels and icons. _Avoid_: Mark, engraving colour

**Glass**: The dark glazed material of screens and readouts. _Avoid_: Screen (that is the display), backdrop

**Target**: The region around a press control that takes its presses, or across a slider's breadth that takes its drags. It is the control's own box unless `--sonic-target-size` makes it larger. _Avoid_: Hit area, touch target, tap target, hitbox

**Relief**: How strongly the light models a surface: its bevels, ridges, grooves, sheen and cast shadows. `--sonic-relief` scales it from 0, flat, to 1. _Avoid_: Depth (one part's own token), elevation, shadow

**Shade**: The dark pole of the light: the colour a surface is mixed towards where it turns from the light or lies in shadow. `--sonic-shade` sets it; black by default. _Avoid_: Shadow (one thing drawn with it), dark, black

**Shine**: The light pole of the light: the colour a surface is mixed towards where it catches the light. `--sonic-shine` sets it; white by default. _Avoid_: Highlight (that is a system colour), sheen (one thing drawn with it), white

**Material**: The shared look every control is drawn from. It ships as material sheets, one per shared thing such as the keycap or the glass, beside each control's own sheet. _Avoid_: Base styles, theme; part, partial, recipe or module for a material sheet

**Core**: The material sheet every control needs: the light, the relief and the lit and unlit colours. _Avoid_: Base, surface

**Pane**: A box of glass that a control or a display draws on. The word names the material sheet; the part is a screen. _Avoid_: Cell, glass (that is the material), screen (that is the display)

**Keycap**: The modelled cap of a button, an option or a toggle, which goes down into its well. The word names the material sheet; the part is still a cap. _Avoid_: "key" for a button

**Arc**: The curved band a ring is drawn with. The word names the material sheet; the part is still a ring. _Avoid_: "arc" for the part

**Mirror**: The copy a control makes of its own light-DOM children in order to draw them inside itself. _Avoid_: Clone, slot content
