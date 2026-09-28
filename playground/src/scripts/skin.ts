import type { SonicSegmented } from '@xsynaptic/sonic-ui';

// The layout's inline script applies the stored skin before first paint
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
		// Private windows may refuse storage; the skin still applies for this visit
	}
	document.dispatchEvent(new Event('playground-skin'));
}

const skinSwitch = document.querySelector<SonicSegmented>('[data-skin-switch]');

if (skinSwitch) {
	skinSwitch.value = readSkin();
	skinSwitch.addEventListener('change', () => {
		applySkin(skinSwitch.value);
	});
}
