// Tone's entry module makes a context as it loads, which the browser warns about before a press; these two do not
import '#scripts/tone-silence.ts';
import { getContext, setContext } from 'tone/build/esm/core/Global.js';

export {
	BiquadFilter,
	Compressor,
	Delay,
	Gain,
	LFO,
	MembraneSynth,
	MonoSynth,
	NoiseSynth,
	Oscillator,
	Panner,
	PolySynth,
	Split,
	Synth,
	type ToneAudioNode,
	WaveShaper,
} from 'tone/build/esm/classes.js';

// Made on a press; a Tone node built before this has no context to run in
export function createContext(): AudioContext {
	const context = new AudioContext({ latencyHint: 'playback' });

	setContext(context);

	return context;
}

export function getTransport() {
	return getContext().transport;
}
