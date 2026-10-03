for (const screen of document.querySelectorAll<HTMLElement>('[data-screen-follow]')) {
	screen.closest('[data-screen-scope]')?.addEventListener('input', (event) => {
		const { target } = event;
		if (!(target instanceof HTMLElement) || !('valueText' in target)) return;

		const name = document.querySelector(
			`#${CSS.escape(target.getAttribute('aria-labelledby') ?? '')}`,
		);
		if (!name || typeof target.valueText !== 'string') return;

		screen.textContent = `${name.textContent.trim()} ${target.valueText}`;
	});
}
