import { error } from '@sveltejs/kit';
import { NotFoundError } from 'slonik';
import { unwrapFunctionStore, _ } from 'svelte-i18n';
import { env } from '$env/dynamic/public';
import { payloadTypes } from '$lib/models';
import type {
	Container,
	EmptyMeasureContainer,
	EmptyModelContainer,
	EmptyOperationalGoalContainer,
	EmptyStrategicGoalContainer,
	EmptyTextContainer,
	Indicator,
	PartialRelation,
	PayloadType,
	SustainableDevelopmentGoal,
	Topic
} from '$lib/models';
import {
	getAllContainerRevisionsByGuid,
	getAllRelatedContainers,
	getAllRelatedInternalObjectives,
	maybePartOf
} from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load = (async ({ params, locals, url }) => {
	let revisions;
	let strategyOverlayData;

	try {
		revisions = await locals.pool.connect(getAllContainerRevisionsByGuid(params.guid));
	} catch (e) {
		if (e instanceof NotFoundError) {
			throw error(404, { message: unwrapFunctionStore(_)('error.not_found') });
		} else {
			throw e;
		}
	}

	let relatedContainers: Container[];
	if (params.type.includes('internal_objective')) {
		relatedContainers = await locals.pool.connect(getAllRelatedInternalObjectives(params.guid, ''));
	} else {
		relatedContainers = await locals.pool.connect(getAllRelatedContainers(params.guid, {}, ''));
	}

	if (url.searchParams.has('edit')) {
		strategyOverlayData = {
			container: revisions[revisions.length - 1],
			isPartOfOptions: [],
			relatedContainers,
			revisions
		};
	} else if (url.searchParams.has('container-preview')) {
		const guid = url.searchParams.get('container-preview') as string;
		const selectedContainer = relatedContainers.find(
			(c) => url.searchParams.get('container-preview') == c.guid
		) as Container;
		const [isPartOfOptions, revisions] = await Promise.all([
			locals.pool.connect(maybePartOf(selectedContainer.payload.type)),
			locals.pool.connect(getAllContainerRevisionsByGuid(guid))
		]);
		strategyOverlayData = {
			container: selectedContainer,
			isPartOfOptions,
			relatedContainers,
			revisions
		};
	} else if (url.searchParams.has('overlay-new')) {
		const selected = url.searchParams.getAll('is-part-of').map(
			(o): PartialRelation => ({
				object: Number(o),
				position: 2 ** 32 - 1,
				predicate: 'is-part-of'
			})
		);
		const newContainer = ((type: PayloadType) => {
			const base = { realm: env.PUBLIC_KC_REALM, relation: selected, user: [] };
			const category: SustainableDevelopmentGoal[] = [];
			const indicator: Indicator[] = [];
			const resource: [] = [];
			const topic: Topic[] = [];
			switch (type) {
				case payloadTypes.enum.measure:
					return { ...base, payload: { category, resource, topic, type } } as EmptyMeasureContainer;
				case payloadTypes.enum.model:
					return { ...base, payload: { category, topic, type } } as EmptyModelContainer;
				case payloadTypes.enum.operational_goal:
					return {
						...base,
						payload: { category, indicator, topic, type }
					} as EmptyOperationalGoalContainer;
				case payloadTypes.enum.strategic_goal:
					return { ...base, payload: { category, topic, type } } as EmptyStrategicGoalContainer;
				default:
					return { ...base, payload: { type } } as EmptyTextContainer;
			}
		})(url.searchParams.get('overlay-new') as PayloadType);
		const isPartOfOptions = await locals.pool.connect(
			maybePartOf(url.searchParams.get('overlay-new') as PayloadType)
		);
		strategyOverlayData = {
			container: newContainer,
			isPartOfOptions,
			relatedContainers,
			revisions
		};
	}

	return {
		container: revisions[revisions.length - 1],
		relatedContainers,
		revisions,
		...(strategyOverlayData ? { strategyOverlayData } : undefined)
	};
}) satisfies PageServerLoad;
