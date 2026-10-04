import type { SonicSegmented } from '@xsynaptic/sonic-ui';

// Shared with the layout's inline script, which applies the skin before first paint
const skinStorageKey = 'sonic-playground-skin';

function readSkin(): string {
	try {
		return localStorage.getItem(skinStorageKey) ?? 'default';
	} catch {
		return 'default';
	}
}

function applySkin(skin: string): void {
	const root = document.documentElement;

	for (const name of root.classList) {
		if (name.startsWith('sonic-skin-')) root.classList.remove(name);
	}
	if (skin !== 'default') root.classList.add(`sonic-skin-${skin}`);
	try {
		localStorage.setItem(skinStorageKey, skin);
	} catch {
		// Private windows can refuse storage
	}
	document.dispatchEvent(new Event('playground-skin'));
}

const skinChoice = document.querySelector<SonicSegmented>('[data-skin-choice]');

if (skinChoice) {
	skinChoice.value = readSkin();
	skinChoice.addEventListener('change', () => {
		applySkin(skinChoice.value);
	});
}
