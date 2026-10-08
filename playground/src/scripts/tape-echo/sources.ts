export type Close = () => void;

type Open = () => Promise<Close>;

const fadeSeconds = 0.03;
const fadeOutSeconds = fadeSeconds * 6;

export type SourceName = 'file' | 'mic' | 'phrase';

const sourceNames: ReadonlySet<string> = new Set<SourceName>(['file', 'mic', 'phrase']);

export function isSourceName(value: string): value is SourceName {
	return sourceNames.has(value);
}

// A source that opens after the choice has moved on is closed at once; a microphone would otherwise stay live
export function createSourceSwitch<Name extends string>(sources: Record<Name, Open>) {
	let turn = 0;
	let close: Close | undefined;

	return async function select(name?: Name): Promise<void> {
		turn += 1;
		close?.();
		close = undefined;
		if (name === undefined) return;

		const current = turn;
		let opened: Close;

		try {
			opened = await sources[name]();
		} catch (error) {
			if (current === turn) throw error;
			return;
		}
		if (current !== turn) {
			opened();
			return;
		}
		close = opened;
	};
}

export function createInlet(destination: AudioNode) {
	const { context } = destination;
	const gain = new GainNode(context, { gain: 0 });

	gain.connect(destination);

	return {
		fade(isOn: boolean): void {
			gain.gain.setTargetAtTime(isOn ? 1 : 0, context.currentTime, fadeSeconds);
		},
		node: gain,
	};
}

export function createMic(context: AudioContext, destination: AudioNode): Open {
	const inlet = createInlet(destination);

	return async () => {
		// The canceller alone keeps the speakers out of the loop; the other two would colour the voice
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: { autoGainControl: false, echoCancellation: true, noiseSuppression: false },
		});
		const node = new MediaStreamAudioSourceNode(context, { mediaStream: stream });

		node.connect(inlet.node);
		inlet.fade(true);

		return () => {
			inlet.fade(false);
			// Stopping the tracks puts the browser's recording indicator out; it waits for the fade
			setTimeout(() => {
				node.disconnect();
				for (const track of stream.getTracks()) track.stop();
			}, fadeOutSeconds * 1000);
		};
	};
}

export function createFilePlayer(context: AudioContext, destination: AudioNode) {
	const inlet = createInlet(destination);
	let buffer: AudioBuffer | undefined;

	return {
		hasFile: () => buffer !== undefined,
		async load(file: Blob): Promise<void> {
			buffer = await context.decodeAudioData(await file.arrayBuffer());
		},
		open: (): Promise<Close> => {
			if (!buffer) return Promise.reject(new Error('No file is loaded'));

			const node = new AudioBufferSourceNode(context, { buffer, loop: true });

			node.connect(inlet.node);
			node.start();
			inlet.fade(true);

			return Promise.resolve(() => {
				inlet.fade(false);
				node.stop(context.currentTime + fadeOutSeconds);
			});
		},
	};
}
