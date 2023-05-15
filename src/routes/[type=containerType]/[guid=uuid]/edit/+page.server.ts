import { getAllRelationObjects, getContainerByGuid, maybePartOf } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load = (async ({ params, locals }) => {
	const container = await locals.pool.connect(getContainerByGuid(params.guid));
	const isPartOfOptions = await locals.pool.connect(maybePartOf(container.type));
	return { container, isPartOfOptions };
}) satisfies PageServerLoad;