import { filterVisible } from '$lib/authorization';
import { audience, payloadTypes } from '$lib/models';
import { getAllRelatedOrganizationalUnitContainers, getManyContainers } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals, parent, url }) => {
	let containers;

	const { currentOrganization, currentOrganizationalUnit } = await parent();

	if (url.searchParams.getAll('included').includes('all-organizational-units')) {
		containers = await locals.pool.connect(
			getManyContainers([currentOrganization.guid], { type: [payloadTypes.enum.indicator] }, '')
		);
	} else {
		let organizationalUnits: string[] = [];
		if (currentOrganizationalUnit) {
			const relatedOrganizationalUnits = await locals.pool.connect(
				getAllRelatedOrganizationalUnitContainers(currentOrganizationalUnit.guid)
			);
			organizationalUnits = relatedOrganizationalUnits
				.filter(({ payload }) => payload.level >= currentOrganizationalUnit.payload.level)
				.map(({ guid }) => guid);
		}
		containers = await locals.pool.connect(
			getManyContainers(
				[currentOrganization.guid],
				{
					audience: url.searchParams.has('audienceChanged')
						? url.searchParams.getAll('audience')
						: [audience.enum['audience.public']],
					organizationalUnits,
					type: [payloadTypes.enum.indicator]
				},
				''
			)
		);
	}

	return {
		container: currentOrganizationalUnit ?? currentOrganization,
		containers: filterVisible(containers, locals.user)
	};
}) satisfies PageServerLoad;
