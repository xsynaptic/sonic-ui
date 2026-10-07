const sign = /^[-−]/;

export function formatClock(seconds: number): string {
	const total = Math.floor(Math.abs(seconds));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor(total / 60) % 60;
	const rest = String(total % 60).padStart(2, '0');
	const prefix = seconds < 0 ? '−' : '';

	if (hours === 0) return `${prefix}${String(minutes)}:${rest}`;

	return `${prefix}${String(hours)}:${String(minutes).padStart(2, '0')}:${rest}`;
}

// An emptied entry or an empty part reads as NaN, which the control ignores; `Number('')` is 0
export function parseClock(text: string): number {
	const clock = text.trim();
	let seconds = 0;

	for (const part of clock.replace(sign, '').split(':')) {
		if (part.trim() === '') return NaN;

		seconds = seconds * 60 + Number(part);
	}

	return sign.test(clock) ? -seconds : seconds;
}
