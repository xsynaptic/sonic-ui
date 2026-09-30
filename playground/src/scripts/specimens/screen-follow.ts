for (const screen of document.querySelectorAll<HTMLElement>('[data-screen-follow]')) {
	screen.closest('[data-screen-scope]')?.addEventListener('input', (event) => {
		if (!(event.target instanceof HTMLElement)) return;

		const slider = event.target.querySelector('[role="slider"]');
		const name = document.querySelector(
			`#${CSS.escape(event.target.getAttribute('aria-labelledby') ?? '')}`,
		);
		if (!slider || !name) return;

		const text = slider.getAttribute('aria-valuetext') ?? slider.getAttribute('aria-valuenow');

		screen.textContent = `${name.textContent.trim()} ${text ?? ''}`;
	});
}
