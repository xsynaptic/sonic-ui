import type { SonicMeter } from '@xsynaptic/sonic-ui';

interface PeakReport {
	alert: HTMLElement;
	hasAlerted: boolean;
	meter: SonicMeter;
	threshold: number;
}

function formatPeak(decibels: number): string {
	if (decibels === -Infinity) return '−∞ dB';

	return `${decibels.toFixed(1).replace('-', '−')} dB`;
}

function bindReport(root: HTMLElement): Array<PeakReport> {
	const meter = root.querySelector<SonicMeter>('sonic-meter');
	const status = root.querySelector<HTMLElement>('[role="status"]');
	const alert = root.querySelector<HTMLElement>('[role="alert"]');
	if (!meter || !status || !alert) return [];

	const report = { alert, hasAlerted: false, meter, threshold: Number(root.dataset.peakReport) };

	root.querySelector('[data-peak-read]')?.addEventListener('click', () => {
		status.textContent = `Peak ${formatPeak(meter.peak)}`;
	});
	root.querySelector('[data-peak-reset]')?.addEventListener('click', () => {
		meter.resetPeak();
		report.hasAlerted = false;
		status.textContent = '';
		alert.textContent = '';
	});

	return [report];
}

const reports = [...document.querySelectorAll<HTMLElement>('[data-peak-report]')].flatMap((root) =>
	bindReport(root),
);

export function watchPeaks(): void {
	for (const report of reports) {
		if (report.hasAlerted || report.meter.peak < report.threshold) continue;

		report.hasAlerted = true;
		report.alert.textContent = `Over ${formatPeak(report.threshold)}`;
	}
}
