export function peakOf(analyser: AnalyserNode, samples: Float32Array<ArrayBuffer>): number {
	let peak = 0;

	analyser.getFloatTimeDomainData(samples);
	for (const sample of samples) peak = Math.max(peak, Math.abs(sample));

	return peak;
}
