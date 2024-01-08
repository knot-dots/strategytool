import { error } from '@sveltejs/kit';
import { _, unwrapFunctionStore } from 'svelte-i18n';
import { filterVisible } from '$lib/authorization';
import { isMeasureContainer } from '$lib/models';
import {
	getAllContainersRelatedToMeasure,
	getAllRelatedInternalObjectives,
	getContainerByGuid
} from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals, params, url }) => {
	let containers;
	const container = await locals.pool.connect(getContainerByGuid(params.guid));

	if (!isMeasureContainer(container)) {
		throw error(404, unwrapFunctionStore(_)('error.not_found'));
	}

	if (url.searchParams.has('related-to')) {
		containers = await locals.pool.connect(
			getAllRelatedInternalObjectives(
				url.searchParams.get('related-to') as string,
				url.searchParams.getAll('relations').length == 0
					? ['hierarchical', 'other']
					: url.searchParams.getAll('relations'),
				url.searchParams.get('sort') ?? ''
			)
		);
	} else {
		containers = await locals.pool.connect(
			getAllContainersRelatedToMeasure(
				container.revision,
				{ terms: url.searchParams.get('terms') ?? '' },
				url.searchParams.get('sort') ?? ''
			)
		);
	}

	return { container, containers: filterVisible(containers, locals.user) };
}) satisfies PageServerLoad;
