# sonic-ui

The words this library uses for its controls, their parts and their values. Where studio hardware has a name for something we use it; otherwise we use the word a web developer would look for. A word with more than one sense here has a qualified entry for each, such as Key (of a keyboard), and keeps its everyday meaning wherever the context settles which is meant. An _Avoid_ names a word that would mislead for that one thing; it leaves the word free everywhere else.

## Language

### Categories

**Control**: Anything the user operates to set a value. _Avoid_: Component, widget, element (that is the custom element that implements one)

**Display**: Anything that shows a signal or a state and takes no input, such as a meter, an LED or a screen. _Avoid_: Readout (that is a control's value bubble)

**Value control**: A control that holds one number between a minimum and a maximum. _Avoid_: Range control

### Controls

**Button**: A control that is pressed. It is either momentary or latching. _Avoid_: Key (that is a keyboard's), pad (that is the XY pad), toggle (that is a control of its own)

**Switch**: A control with a bat handle that tilts between two or three positions. _Avoid_: Toggle (that is a control of its own)

**Toggle**: A control whose round cap slides in a well between two or three positions. _Avoid_: Slide switch (one letter from the slider)

**Dial**: A value control that turns. The word covers the whole thing: cap, indicator, ring and scale. _Avoid_: Knob (on hardware that is only the cap)

**Slider**: A value control whose cap slides along a groove. _Avoid_: Fader (one use of a slider)

**Number box**: A value control shown as digits. It is dragged, stepped or typed into.

**Barrel**: A look on the number box in which the values roll past a fixed line, the neighbouring values dimmer above and below. _Avoid_: Thumbwheel (that is a ridged cap on a slider)

**Segmented**: A row of joined caps, one of which is always chosen.

**XY pad**: A control that sets two values at once by moving a puck around a field.

**Split**: A group of value controls whose values always add up to the same total.

**Envelope**: A graph of an envelope's stages. Dragging its handles turns the dials that hold each stage's value. _Avoid_: ADSR (one shape of envelope)

**Keyboard** (the control): A control laid out as a piano keyboard, in whole octaves, that reports each note as its key goes down and comes up. Where a computer keyboard could also be meant, say the keyboard control.

### Displays

**Meter**: A display of signal level, drawn as a bar or a ladder. _Avoid_: VU (one kind of ballistics)

**LED**: A single lamp that is lit, idle or unlit. _Avoid_: Indicator (that is the line on a cap)

**Screen**: A box of glass that holds text, graphics or a control. _Avoid_: Display (that is the category)

**Panel**: A titled section that groups related controls and displays.

**Waveform**: The close-up view of a wave, which scrolls under a fixed playhead.

**Spectrum**: A display of level against frequency, drawn as one filled shape or as a bar per band, which rises at once and falls at a set rate. _Avoid_: Analyser (that is the node that feeds it), spectrogram (that plots frequency over time)

**Ticker**: A display of one line of content that scrolls there and back when it does not fit its box.

**Wavestrip**: The overview of a whole track, drawn as bars and scrubbed to seek. _Avoid_: Waveform (that is the close-up)

### Parts

**Cap**: The part of a control that the hand moves. On a dial it is the knob, on a slider the handle, on a button the face, on a key its top. _Avoid_: Thumb, handle (that is an envelope's point)

**Legend**: What is printed on the cap of a button or a toggle: an icon or text, always an element. A cap with no legend is blank; an LED is not a legend. _Avoid_: Label (that is printed beside a part)

**Label** (printed): Text printed beside a part rather than on its cap, such as a switch position's label, a marker's label or a scale's numbers.

**Rule** (of a panel): A line printed across a panel to divide it, apart from the lines either side of its title.

**Indicator**: The line on a cap that shows where it is set. _Avoid_: Pointer (that is the mouse, pen or finger), marker (that is a wave's)

**Groove**: The slot a slider's cap runs in. _Avoid_: Track (that is audio)

**Ring**: A lit arc. Around a dial it shows the value; around a button it shows progress.

**Dot**: A small light that marks a place: the short lit arc on an endless dial's ring that marks its value, or the mark on a lit key. _Avoid_: Segment (that is a meter's), LED (a dot is not one)

**Scale** (printed): The ticks and labels printed beside a dial or slider. _Avoid_: Legend (that is on a cap)

**Notch**: The mark etched at each position of a stepped control. _Avoid_: Detent (that is a value caught in passing), tick (ticks belong to a scale)

**Edge**: The line that sets a part off from what is behind it.

**Well**: The recess a button or an option sits in, or a toggle's cap slides in.

**Bezel**: The surface that houses a light, such as a meter's bed or an LED's surround.

**Lens**: The glass of a light, lit or not.

**Bat**: The handle of a switch.

**Bushing**: The collar that a switch's bat pivots in.

**Option**: One of the choices in a segmented control. It is stepped through by the same rules as a position. _Avoid_: Segment (that is a meter's)

**Field**: The area an XY pad's puck moves in. _Avoid_: Pad (that is the whole control)

**Puck**: The part of an XY pad that is dragged. _Avoid_: Handle (that is an envelope's)

**Axis** (of an XY pad): One of the pad's two directions, x and y, each with a value and a mapping of its own. Its part sits on the puck and takes focus and keys for that value.

**Bar**: The lit column of a meter. _Avoid_: Level (that is an input)

**Segment**: One light in a meter's ladder. _Avoid_: LED (that is a display of its own)

**Ladder**: A meter drawn as separate segments, each with its own threshold.

**Reticle**: The pair of arcs round a held puck or handle on a skin with no relief. _Avoid_: Bracket (that is a region's frame), ring (that is a lit arc)

**Readout**: The bubble that shows a control's value while it is being moved. _Avoid_: Tooltip

**Entry**: The text field in a readout where a value is typed.

**Arrow** (of a number box): One of the two parts that step a number box's value: the increment up, the decrement down. _Avoid_: Button (that is a control of its own)

**Tape**: The part of a ticker that moves.

### Envelope

**Stage**: One leg of an envelope. The stages are delay, attack, hold, decay, sustain and release. _Avoid_: Segment (that is a meter's)

**Handle**: A point on an envelope that is dragged to set a stage's time or level.

**Curve**: How far a stage bows away from a straight line. Each curved stage has a second handle, halfway along, that sets it. _Avoid_: Dot (that is a ring's or a key's)

**Floor** (of an envelope): The strip of an envelope's fill between its zero level and the bottom of its box.

### Keyboard

**Key** (of a keyboard): One of the keyboard control's keys, white or black. Where a computer key could also be meant, say piano key.

**White key**: A key of the seven natural notes, whatever colour a skin gives it.

**Black key**: A key of the five notes between the white keys' notes, raised and set back, whatever colour a skin gives it.

**Front** (of a key): The face at the near end of a key, which shortens as the key goes down.

**Note**: The pitch a key stands for, given as a MIDI note number.

**Octave**: Twelve keys from C up to B, the unit a keyboard is drawn and ranged in. Octaves are numbered as in scientific pitch, where MIDI note 60 is C4.

**Glissando**: A drag along a keyboard that plays each key it crosses, letting go of the one before.

**Held** (notes of a keyboard): The notes a page draws down on a keyboard without sounding them, such as a chord's other tones or notes arriving over MIDI. A key is drawn down while a finger or the page holds it.

### Waves

**Peaks**: The amplitude summary, worked out ahead of time, that a wave control draws. Bands sit beside them and colour what they draw.

**Band**: One of the frequency ranges levels are split into: a wave's, with a level per band per frame, or a spectrum's, drawn as a bar each. _Avoid_: Bin (that is one frequency of a spectrum), zone (that is a stretch of a level display)

**Normalize**: To scale a band mix so that its strongest channel is at full, as peak normalising does a signal. _Avoid_: Lift (in grading that raises the shadows)

**Contrast** (of bands): The exponent on each band's weight in the mix. Above 1 the strongest band takes more of the colour.

**Tilt** (of bands): A gain that rises steadily from the lowest band to the highest, in decibels a band.

**Playhead**: The line that marks the current time on a wave.

**Ghost**: The faint line that shows where playback really is while the playhead is being held.

**Window** (of a waveform): The stretch of a wave that a waveform shows at once, as wide as its box at its zoom.

**Zoom** (of a waveform): How closely a waveform shows a wave, in pixels per second: a larger zoom shows a shorter window.

**Scrim**: A wash laid between a wave and what is printed over it, so the print reads: across the whole waveform, or behind one marker's label.

**Marker**: A labelled point or region on a wave; with no end it is a point marker, with one a region. _Avoid_: Cue (a cue is one kind of marker, and the consumer's word)

**Kind** (of a marker): The consumer's name for a group of markers or regions, which `--sonic-marker-<kind>` colours.

**Region** (of a wave): A stretch of a wave with a start and an end. An editable one is an element; a marker's is a picture.

**Bracket**: The frame drawn round an editable region. _Avoid_: Reticle (that is a held point's arcs)

**Lane**: One of the rows that point markers stack in when they sit too close to share one.

**Preview**: A time shown as a scrub's edge without being scrubbed to. _Avoid_: Ghost (that is where playback is)

**Scrub**: To drag along a wave, or along a slider that seeks, looking for a place to seek to. _Avoid_: Seek (that is the jump itself)

### Values

**Default**: The value a value control goes back to when it is reset.

**Origin**: The value that a control's light starts from.

**Detent**: A single value that a control catches on as it passes. _Avoid_: Notch (that is the mark)

**Position** (of a stepped control): One of the fixed settings of a switch, a toggle or a stepped value control. _Avoid_: Detent (on hardware every click is one; here a detent is a single value caught in passing), entry (that is typed)

**Proportion**: How far along its travel a value sits, from 0 at one end to 1 at the other. _Avoid_: Normalized value

**Mapping**: The rule that turns a value into a proportion and back, including where the value snaps. _Avoid_: Scale (that is printed)

**Value model**: What a value control holds behind its drawing: the value, the value last asked for, its mapping and any limit put on it. _Avoid_: State (that is a skin's)

**Taper**: The shape of a mapping, linear or logarithmic.

**Midpoint**: The value that sits halfway along the travel. Setting it bends the taper to fit. _Avoid_: Skew

**Modulation**: How far a modulation source can push a control's value to either side of where it is set.

**Modulation value**: Where the value is at this moment, with modulation applied.

**Clock**: A time written as minutes and seconds, with hours once it passes one. _Avoid_: Timecode (that counts frames)

**Level** (of a meter): A meter reading given as a signal amplitude. The meter shows it in decibels and applies ballistics.

**Value** (of a meter): A meter reading given in the meter's own units, shown exactly as given.

**Bin**: One of the evenly spaced frequencies in a frame given to a spectrum, each with a level in decibels. _Avoid_: Band (that is a range of frequencies)

**Zone** (of a level display): A stretch of a level display's range with its own colour: lit, then hot, then clip. The hot zone is drawn in the warning colour and the clip zone in the danger colour. _Avoid_: Band (that is a range of frequencies)

**Ballistics**: How quickly a meter's bar or a spectrum's bins rise and fall, following a metering standard.

### Behaviour

**Press**: A pointer or a key going down on a control.

**Momentary**: Pressed only for as long as it is held.

**Latching**: Staying pressed after release, until pressed again. _Avoid_: Toggle (that is a control of its own)

**Armed**: Lit at a rest level, to show that a button is set and ready but not yet active.

**Endless**: Turning with no end stops, so the value wraps from maximum round to minimum.

**Spring**: Going back to the origin when let go.

**Fine**: A drag at a slower pace, taken while Shift is held, on a value control or a region.

**Cancel zone**: The margin above and below a cancellable control's box that a drag may stray into. Past it the drag goes back to where it began, and coming back resumes it. `--sonic-cancel-zone` sets its width.

**Repeat** (of an arrow): The steps a held arrow keeps taking, which grow the longer it is held.

**Locked** (of a split member): Kept at its value while the split shares its total among the rest. The consumer locks a member with `data-sonic-locked`, and a disabled member counts as locked.

**Hold** (of a ticker): The wait at each end of its travel.

**Overflowing**: Holding more content than fits the box.

**Clipped** (of content): Having content past one end of the box, as a region or a ticker's tape can.

### States

**Held** (state): On a switch or a toggle while its momentary position is held. A button's state for the same moment is pressed.

**Springing**: Gliding back to the origin after a sprung control is let go. A sprung slider carries it until its cap arrives.

**At origin**: Sitting at the origin. A value control carries it, an endless one never, and an LED beside the control lights while it does.

**Dimmed**: Shown at reduced strength but still working, because what it sets is not in effect for now, as with the dial of a bypassed effect. A value control dims its light; a marker dims as a whole. Disabled is another thing: the light goes out and input stops.

**Pending**: Of a stretch of a wave, waiting for its peaks; it draws a placeholder after a delay. Empty is another thing: no peaks at all.

### Skinning

**Skin**: A stylesheet that restyles every control by setting tokens. With no skin a control is bare: no cap and no well, so a press control is its legend alone, or its edge when it has none, in the text colour around it. _Avoid_: Theme

**Token**: A public custom property that a skin may set.

**Hook class**: A public class on one of a control's drawn parts.

**State**: A public attribute a control writes on its drawn part, `data-sonic-<state>`, that a skin may select on, such as dragging or pressed. An attribute the consumer writes, such as `data-sonic-locked`, is not a state.

**Lit**: Showing a light that is on, in one of the lit colours, as an LED, a ring, a meter's bar or a key's dot can.

**Lit colour**: The colour a lamp shows, named for what it reports: lit, ok, warning or danger. Lit is the skin's own colour; idle is lit at a lower level. _Avoid_: A colour's own name (green, red); hot and clip on a lamp (those are a meter's zones)

**Ink**: The colour of anything printed or etched, such as scales, labels and icons.

**Glass**: The dark glazed material of screens and readouts. _Avoid_: Screen (that is the display)

**Target**: The region around a press control that takes its presses, or across a slider's breadth that takes its drags. It is the control's own box unless `--sonic-target-size` makes it larger.

**Light** (of the material): The one source every surface is shaded by, so that every control agrees on where shadows fall.

**Tilt** (of the light): The angle the light leans from straight above; every directional gradient and cast shadow follows it.

**Relief**: How strongly the light models a surface, from flat to full: its bevels, ridges, grooves, sheen and cast shadows. _Avoid_: Depth (that is one part's own token)

**Gloss**: How strongly a cap's face catches the light as a sheen, apart from its bevels, from matte upwards. _Avoid_: Shine (that is the light pole)

**Shade**: The dark pole of the light: the colour a surface is mixed towards where it turns from the light or lies in shadow. _Avoid_: Shadow (one thing drawn with it)

**Shine**: The light pole of the light: the colour a surface is mixed towards where it catches the light. _Avoid_: Highlight (that is a system colour), sheen (one thing drawn with it)

**Material**: The shared look every control is drawn from. It ships as material sheets, one per shared thing such as the keycap or the glass, beside each control's own sheet.

**Core**: The material sheet every control needs: the light, the relief and the lit and unlit colours.

**Pane**: A box of glass that a control or a display draws on. The word names the material sheet; the part is a screen. _Avoid_: Glass (that is the material), screen (that is the display)

**Keycap**: The modelled cap of a button, an option or a toggle, which goes down into its well. The word names the material sheet; the part is still a cap.

**Arc**: The curved band a ring is drawn with. The word names the material sheet; the part is still a ring.

**Mirror**: The copy a control makes of its own light-DOM children in order to draw them inside itself.
