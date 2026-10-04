import type { ReactNode } from 'react';

import { createElement, useEffect } from 'react';

export function IslandDial(): ReactNode {
	// An effect runs once React has hydrated the island, so the appended control is no mismatch
	useEffect(() => {
		void import('../../../../packages/sonic-ui/dist/dev/define/dial.js');
	}, []);

	return createElement('sonic-dial', {
		'aria-label': 'Cutoff',
		max: '90',
		min: '10',
		step: '5',
		value: '40',
	});
}
