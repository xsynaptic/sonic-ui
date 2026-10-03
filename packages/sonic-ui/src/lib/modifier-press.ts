const isApple = /^(Mac|iP)/.test(navigator.platform);

// macOS sends Ctrl-click as a primary button press and opens the context menu
export function isMenuPress(event: MouseEvent): boolean {
	return isApple && event.ctrlKey;
}

export function isResetPress(event: MouseEvent): boolean {
	return isApple ? event.metaKey : event.ctrlKey;
}
