import type { SonicSegmented } from '@xsynaptic/sonic-ui';

const skinStorageKey = 'sonic-playground-skin';
const schemeStorageKey = 'sonic-playground-scheme';

function read(key: string, fallback: string): string {
	try {
		return localStorage.getItem(key) ?? fallback;
	} catch {
		return fallback;
	}
}

function store(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Private windows can refuse storage
	}
}

const homeSchemes: Record<string, string> = {
	amber: 'dark',
	flat: 'light',
	lime: 'dark',
	slate: 'dark',
};

function applyScheme(scheme: string): void {
	if (scheme === 'system') delete document.documentElement.dataset.scheme;
	else document.documentElement.dataset.scheme = scheme;
}

function applySkin(skin: string): void {
	const root = document.documentElement;

	for (const name of root.classList) {
		if (name.startsWith('sonic-skin-')) root.classList.remove(name);
	}
	if (skin !== 'default') root.classList.add(`sonic-skin-${skin}`);

	const scheme = homeSchemes[skin];
	const choice = document.querySelector<SonicSegmented>('[data-scheme-choice]');
	if (!scheme || !choice) return;

	choice.value = scheme;
	applyScheme(scheme);
	store(schemeStorageKey, scheme);
}

interface Choice {
	apply: (value: string) => void;
	fallback: string;
	key: string;
	selector: string;
}

function bindChoice({ apply, fallback, key, selector }: Choice): void {
	const choice = document.querySelector<SonicSegmented>(selector);
	if (!choice) return;

	const stored = read(key, fallback);

	choice.value = choice.querySelector(`[data-sonic-value="${CSS.escape(stored)}"]`)
		? stored
		: fallback;
	choice.addEventListener('change', () => {
		apply(choice.value);
		store(key, choice.value);
		document.dispatchEvent(new Event('playground-skin'));
	});
}

bindChoice({
	apply: applySkin,
	fallback: 'default',
	key: skinStorageKey,
	selector: '[data-skin-choice]',
});
bindChoice({
	apply: applyScheme,
	fallback: 'system',
	key: schemeStorageKey,
	selector: '[data-scheme-choice]',
});
