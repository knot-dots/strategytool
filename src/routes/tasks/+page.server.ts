import { filterVisible } from '$lib/authorization';
import { predicates } from '$lib/models';
import {
	getAllRelatedOrganizationalUnitContainers,
	getAllRelatedUsers,
	getManyTaskContainers
} from '$lib/server/db';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { _, unwrapFunctionStore } from 'svelte-i18n';

export const load = (async ({ locals, parent, url }) => {
	let organizationalUnits: string[] = [];

	const { currentOrganization, currentOrganizationalUnit } = await parent();

	if (currentOrganization.payload.default) {
		throw error(404, unwrapFunctionStore(_)('error.not_found'));
	}

	if (currentOrganizationalUnit) {
		const relatedOrganizationalUnits = await locals.pool.connect(
			getAllRelatedOrganizationalUnitContainers(currentOrganizationalUnit.guid)
		);
		organizationalUnits = relatedOrganizationalUnits
			.filter(({ payload }) => payload.level >= currentOrganizationalUnit.payload.level)
			.map(({ guid }) => guid);
	}

	let containers = await locals.pool.connect(
		getManyTaskContainers({
			assignees: url.searchParams.getAll('assignee'),
			organization: currentOrganization.payload.default ? undefined : currentOrganization.guid,
			organizationalUnits,
			taskCategories: url.searchParams.getAll('taskCategory'),
			terms: url.searchParams.get('terms') ?? ''
		})
	);

	containers = containers.filter(({ relation, organizational_unit }) => {
		if (
			!url.searchParams.getAll('included').includes('is-part-of-measure') &&
			relation.some(({ predicate }) => predicate == predicates.enum['is-part-of-measure'])
		) {
			return false;
		}

		if (
			!url.searchParams.getAll('included').includes('subordinate-organizational-units') &&
			organizational_unit != (currentOrganizationalUnit?.guid ?? null)
		) {
			return false;
		}

		return true;
	});

	return { containers: filterVisible(containers, locals.user) };
}) satisfies PageServerLoad;
