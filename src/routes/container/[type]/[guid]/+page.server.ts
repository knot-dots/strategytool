import { error, redirect } from '@sveltejs/kit';
import * as jose from 'jose';
import { env as privateEnv } from '$env/dynamic/private';
import { env } from '$env/dynamic/public';
import { isContainerType } from '$lib/models';
import type { SustainableDevelopmentGoal } from '$lib/models';
import { getContainerByGuid, updateContainer } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

export const actions = {
	default: async ({ locals, params, request }) => {
		if (!isContainerType(params.type)) {
			throw error(404, 'Unknown container type');
		}

		if (
			!request.headers.has('Authorization') ||
			!request.headers.get('Authorization')?.startsWith('Bearer ')
		) {
			throw error(401, { message: 'Missing authorization' });
		}

		const token = (request.headers.get('Authorization') as string).substring(7);

		const jwks = jose.createRemoteJWKSet(
			new URL(`${privateEnv.KC_URL}/realms/${env.PUBLIC_KC_REALM}/protocol/openid-connect/certs`)
		);
		const {
			payload: { iss, sub }
		} = await jose
			.jwtVerify(token, jwks, {
				issuer: `${env.PUBLIC_KC_URL}/realms/${env.PUBLIC_KC_REALM}`,
				requiredClaims: ['iss', 'sub']
			})
			.catch((e) => {
				if (e instanceof jose.errors.JWTInvalid) {
					throw error(403, { message: 'Invalid token' });
				} else if (e instanceof jose.errors.JWTExpired) {
					throw error(403, { message: 'Expired token' });
				} else if (e instanceof jose.errors.JWTClaimValidationFailed) {
					throw error(403, { message: 'Insufficient claims' });
				} else {
					throw e;
				}
			});

		const data = await request.formData();
		const payload = {
			category: data.get('category') as SustainableDevelopmentGoal,
			description: data.get('description') as string,
			summary: data.get('summary') as string,
			title: data.get('title') as string
		};
		const user = [
			{
				issuer: iss as string,
				subject: sub as string
			}
		];
		await locals.pool.connect(
			updateContainer({
				guid: params.guid,
				payload,
				type: params.type,
				realm: env.PUBLIC_KC_REALM ?? '',
				user
			})
		);

		throw redirect(303, '/');
	}
} satisfies Actions;

export const load = (async ({ params, locals }) => {
	return await locals.pool.connect(getContainerByGuid(params.guid));
}) satisfies PageServerLoad;
