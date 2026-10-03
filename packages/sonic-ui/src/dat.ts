import type { WaveformData } from '#lib/waveform-buckets.ts';

import { clamp } from '#lib/math.ts';

export type { WaveformData } from '#lib/waveform-buckets.ts';

export interface DatHeader {
	bits: 8 | 16;
	channels: number;
	dataOffset: number;
	pairs: number;
	pairsPerSecond: number;
	sampleRate: number;
	samplesPerPixel: number;
	version: 1 | 2;
}

function readVersion(view: DataView): 1 | 2 {
	const version = view.getInt32(0, true);
	if (version === 1 || version === 2) return version;

	throw new Error(`A .dat file of version ${String(version)} is not one this reads`);
}

export function readDatHeader(buffer: ArrayBuffer): DatHeader {
	if (buffer.byteLength < 20) throw new Error('A .dat header takes at least 20 bytes');

	const view = new DataView(buffer);
	const version = readVersion(view);
	const dataOffset = version === 1 ? 20 : 24;
	if (buffer.byteLength < dataOffset) {
		throw new Error(`A version ${String(version)} .dat header takes ${String(dataOffset)} bytes`);
	}

	const channels = version === 1 ? 1 : view.getInt32(20, true);
	if (channels < 1) throw new Error('A .dat header names no channels');

	const sampleRate = view.getInt32(8, true);
	const samplesPerPixel = view.getInt32(12, true);

	return {
		bits: (view.getUint32(4, true) & 1) === 1 ? 8 : 16,
		channels,
		dataOffset,
		pairs: view.getUint32(16, true),
		pairsPerSecond: sampleRate / samplesPerPixel,
		sampleRate,
		samplesPerPixel,
		version,
	};
}

export function datByteRange(
	header: DatHeader,
	fromPair: number,
	toPair: number,
): [number, number] | undefined {
	const from = clamp(Math.floor(fromPair), 0, header.pairs);
	const to = clamp(Math.ceil(toPair), from, header.pairs);
	// A server ignores an inverted `Range` and sends the whole file
	if (!(to > from)) return undefined;

	const pairBytes = (header.channels * 2 * header.bits) / 8;

	return [header.dataOffset + from * pairBytes, header.dataOffset + to * pairBytes - 1];
}

// Typed arrays read the platform's byte order; every browser platform is little-endian, as the format is
// A range response can end mid-sample; the odd byte is dropped
export function readDatSamples(header: DatHeader, body: ArrayBuffer): Int8Array | Int16Array {
	return header.bits === 8
		? new Int8Array(body)
		: new Int16Array(body, 0, Math.floor(body.byteLength / 2));
}

export function readDatWaveformData(header: DatHeader, body: ArrayBuffer): WaveformData {
	return {
		channels: header.channels,
		fullScale: header.bits === 8 ? 128 : 32_768,
		pairsPerSecond: header.pairsPerSecond,
		samples: readDatSamples(header, body),
	};
}
