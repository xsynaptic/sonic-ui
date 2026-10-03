import { expect, test } from 'vitest';

import { datByteRange, readDatHeader, readDatSamples, readDatWaveformData } from '#dat.ts';

function bytes(...words: Array<string>): ArrayBuffer {
	const hex = words.join('');

	return Uint8Array.from({ length: hex.length / 2 }, (_byte, index) =>
		Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
	).buffer;
}

// Version 1, 8-bit, 44100 Hz, 256 samples per pixel, 620159 pairs
const monoHeader = ['01000000', '01000000', '44ac0000', '00010000', '7f760900'];

// Version 2, 16-bit, 44100 Hz, 256 samples per pixel, 500 pairs, two channels
const stereoHeader = ['02000000', '00000000', '44ac0000', '00010000', 'f4010000', '02000000'];

// Channel 0's min -300 and max 1200, then channel 1's -2 and 3
const stereoBody = ['d4feb004', 'feff0300'];

test('a version 1 header reads little-endian', () => {
	expect(readDatHeader(bytes(...monoHeader))).toEqual({
		bits: 8,
		channels: 1,
		dataOffset: 20,
		pairs: 620_159,
		pairsPerSecond: 172.265625,
		sampleRate: 44_100,
		samplesPerPixel: 256,
		version: 1,
	});
});

test('a version 2 header reads its channels at 20 and its data from 24', () => {
	const header = readDatHeader(bytes(...stereoHeader));

	expect(header.bits).toBe(16);
	expect(header.channels).toBe(2);
	expect(header.dataOffset).toBe(24);
});

test('a byte range covers every channel and byte of its pairs, ending inclusive', () => {
	const header = readDatHeader(bytes(...stereoHeader));

	expect(datByteRange(header, 100, 200)).toEqual([24 + 100 * 8, 24 + 200 * 8 - 1]);
});

test('a fractional pair widens to the whole pairs around it', () => {
	const header = readDatHeader(bytes(...stereoHeader));

	expect(datByteRange(header, 100.5, 199.2)).toEqual([24 + 100 * 8, 24 + 200 * 8 - 1]);
});

test('a byte range stops at the last pair, and one past it is empty', () => {
	const header = readDatHeader(bytes(...stereoHeader));

	expect(datByteRange(header, 400, 900)).toEqual([24 + 400 * 8, 24 + 500 * 8 - 1]);
	expect(datByteRange(header, 600, 700)).toBeUndefined();
});

test('a header it cannot read throws', () => {
	expect(() => readDatHeader(bytes('03000000', ...stereoHeader.slice(1)))).toThrow();
	expect(() => readDatHeader(bytes(...monoHeader.slice(0, 3)))).toThrow();
	expect(() => readDatHeader(bytes(...stereoHeader.slice(0, 5), '00000000'))).toThrow();
});

test('a 16-bit body reads back its interleaved min and max', () => {
	const header = readDatHeader(bytes(...stereoHeader));
	const samples = readDatSamples(header, bytes(...stereoBody));

	expect(samples).toBeInstanceOf(Int16Array);
	expect([...samples]).toEqual([-300, 1200, -2, 3]);
});

test('an 8-bit body reads signed', () => {
	const samples = readDatSamples(readDatHeader(bytes(...monoHeader)), bytes('807f'));

	expect([...samples]).toEqual([-128, 127]);
});

test('waveform data takes its full scale from the bits and its pairs per second from the rate', () => {
	// Version 1, 8-bit, 22050 Hz, 400 samples per pixel; version 2, 16-bit, 44100 Hz, 400, two channels
	const eight = readDatHeader(bytes('01000000', '01000000', '22560000', '90010000', 'e8030000'));
	const sixteen = readDatHeader(
		bytes('02000000', '00000000', '44ac0000', '90010000', 'e8030000', '02000000'),
	);

	expect(readDatWaveformData(eight, bytes('807f'))).toMatchObject({
		channels: 1,
		fullScale: 128,
		pairsPerSecond: 55.125,
	});
	expect(readDatWaveformData(sixteen, bytes(...stereoBody))).toMatchObject({
		channels: 2,
		fullScale: 32_768,
		pairsPerSecond: 110.25,
	});
});

test.each([
	['01000080', 8],
	['02000000', 16],
	['feffffff', 16],
] as const)('flags %s read only bit 0, for %d bits', (flags, bits) => {
	expect(readDatHeader(bytes('01000000', flags, ...monoHeader.slice(2))).bits).toBe(bits);
});

test('the last pair of an 8-bit mono file ends on the last byte', () => {
	const header = readDatHeader(bytes('01000000', '01000000', '44ac0000', '00010000', 'f4010000'));

	expect(datByteRange(header, 499, 500)).toEqual([1018, 1019]);
});

test('a version 2 header cut short of its channels is refused', () => {
	expect(() => readDatHeader(bytes(...stereoHeader).slice(0, 23))).toThrow('24 bytes');
});

test('a 16-bit body cut at an odd byte reads the whole samples before it', () => {
	const header = readDatHeader(bytes(...stereoHeader));

	expect([...readDatSamples(header, bytes('d4feb004', 'fe'))]).toEqual([-300, 1200]);
});
