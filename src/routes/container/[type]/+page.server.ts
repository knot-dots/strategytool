import { error, redirect } from '@sveltejs/kit';
import { _, unwrapFunctionStore } from 'svelte-i18n';
import { env } from '$env/dynamic/public';
import { isContainerType } from '$lib/models';
import type { ContainerType, SustainableDevelopmentGoal } from '$lib/models';
import { createContainer, maybePartOf } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

export const actions = {
	default: async ({ locals, params, request }) => {
		if (!isContainerType(params.type)) {
			throw error(404, 'Unknown container type');
		}

		if (locals.user == null) {
			throw error(401, { message: 'Missing authorization' });
		}

		const data = await request.formData();
		const payload = {
			category: data.get('category') as SustainableDevelopmentGoal,
			description: data.get('description') as string,
			summary: data.get('summary') as string,
			title: data.get('title') as string
		};
		const relation = data
			.getAll('is-part-of')
			.map((v) => ({ predicate: 'is-part-of', object: Number(v) }));
		const result = await locals.pool.connect(
			createContainer({
				payload,
				type: params.type,
				realm: env.PUBLIC_KC_REALM ?? '',
				relation,
				user: [locals.user]
			})
		);

		let location = '/';
		if (data.has('redirect')) {
			location = `${data.get('redirect')}?is-part-of=${result.revision}`;
		}

		throw redirect(303, location);
	}
} satisfies Actions;

export const load = (async ({ params, locals }) => {
	if (!isContainerType(params.type)) {
		error(404, { message: unwrapFunctionStore(_)('unknown_container_type') });
	}
	const isPartOfOptions = await locals.pool.connect(maybePartOf(params.type as ContainerType));
	return {
		isPartOfOptions
	};
}) satisfies PageServerLoad;
