import { boolean, z } from 'zod';
import { env as privateEnv } from '$env/dynamic/private';
import { env } from '$env/dynamic/public';
import type { NewUser, User } from '$lib/models';

const data = new URLSearchParams([['grant_type', 'client_credentials']]);
const credentials = btoa(`${env.PUBLIC_KC_CLIENT_ID}:${privateEnv.KC_CLIENT_SECRET}`);

async function getToken() {
	const response = await fetch(
		`${env.PUBLIC_KC_URL}/realms/${env.PUBLIC_KC_REALM}/protocol/openid-connect/token`,
		{
			body: data,
			headers: { Authorization: `Basic ${credentials}` },
			method: 'POST'
		}
	);
	if (!response.ok) {
		throw new Error('Failed to obtain token for service account.');
	}
	return z.object({ access_token: z.string() }).parse(await response.json()).access_token;
}

export async function createUser(user: NewUser) {
	const token = await getToken();
	const response = await fetch(`${env.PUBLIC_KC_URL}/admin/realms/${env.PUBLIC_KC_REALM}/users`, {
		body: JSON.stringify({
			email: user.email,
			enabled: true,
			requiredActions: ['UPDATE_PASSWORD', 'UPDATE_PROFILE']
		}),
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		method: 'POST'
	});
	if (!response.ok) {
		throw new Error(`Failed to create user in realm. Keycloak responded with ${response.status}`);
	}
	return z.string().uuid().parse(response.headers.get('Location')?.split('/').pop());
}

export async function addUserToGroup(user: User, group: string) {
	const token = await getToken();
	const response = await fetch(
		`${env.PUBLIC_KC_URL}/admin/realms/${env.PUBLIC_KC_REALM}/users/${user.guid}/groups/${group}`,
		{
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			method: 'PUT'
		}
	);
	if (!response.ok) {
		throw new Error(`Failed to add user to group. Keycloak responded with ${response.status}`);
	}
}

export async function sendVerificationEmail(user: User, redirectURI: string) {
	const token = await getToken();
	const url = new URL(
		`${env.PUBLIC_KC_URL}/admin/realms/${env.PUBLIC_KC_REALM}/users/${user.guid}/send-verify-email`
	);
	url.searchParams.set('client_id', env.PUBLIC_KC_CLIENT_ID ?? '');
	url.searchParams.set('redirect_uri', redirectURI);
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		method: 'PUT'
	});
	if (!response.ok) {
		throw new Error(
			`Failed to send verification email. Keycloak responded with ${response.status}`
		);
	}
}

export async function findUserByEmail(email: string) {
	const token = await getToken();
	const url = new URL(`${env.PUBLIC_KC_URL}/admin/realms/${env.PUBLIC_KC_REALM}/users`);
	url.searchParams.set('email', email);
	url.searchParams.set('exact', 'true');
	url.searchParams.set('briefRepresentation', 'true');

	const response = await fetch(url.toString(), {
		headers: { Authorization: `Bearer ${token}` }
	});

	if (!response.ok) {
		throw new Error(`Failed to find user in realm. Keycloak responded with ${response.status}`);
	}

	const data = await response.json();

	return z
		.array(
			z.object({
				firstName: z.string().optional(),
				id: z.string().uuid(),
				lastName: z.string().optional()
			})
		)
		.length(1)
		.parse(data)[0];
}

export async function createGroup(name: string) {
	const token = await getToken();
	const response = await fetch(`${env.PUBLIC_KC_URL}/admin/realms/${env.PUBLIC_KC_REALM}/groups`, {
		body: JSON.stringify({ name }),
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		method: 'POST'
	});
	if (!response.ok) {
		throw new Error(`Failed to create group in realm. Keycloak responded with ${response.status}`);
	}
	return z.string().uuid().parse(response.headers.get('Location')?.split('/').pop());
}

export async function getMembers(group: string) {
	const token = await getToken();
	const response = await fetch(
		`${env.PUBLIC_KC_URL}/admin/realms/${env.PUBLIC_KC_REALM}/groups/${group}/members`,
		{
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json'
			}
		}
	);
	if (!response.ok) {
		throw new Error(`Failed to fetch members. Keycloak responded with ${response.status}`);
	}
	return z
		.array(
			z.object({
				id: z.string().uuid(),
				email: z.string().email(),
				emailVerified: z.boolean(),
				enabled: boolean(),
				username: z.string()
			})
		)
		.parse(await response.json());
}

const client = z.intersection(
	z.record(z.string(), z.unknown()),
	z.object({
		id: z.string().uuid(),
		redirectUris: z.array(z.string()),
		webOrigins: z.array(z.string())
	})
);

type Client = z.infer<typeof client>;

function urlFromGuid(guid: string) {
	const url = new URL(env.PUBLIC_BASE_URL ?? '');
	url.hostname = `${guid}.${url.hostname}`;
	url.pathname = '/*';
	return url;
}

export async function updateAccessSettings(guid: string) {
	const token = await getToken();

	const getResponse = await fetch(
		`${env.PUBLIC_KC_URL}/admin/realms/${env.PUBLIC_KC_REALM}/clients?clientId=${env.PUBLIC_KC_CLIENT_ID}`,
		{
			headers: {
				Authorization: `Bearer ${token}`
			}
		}
	);
	if (!getResponse.ok) {
		throw new Error(
			`Failed to fetch representation of client ${env.PUBLIC_KC_CLIENT_ID} in realm. Keycloak responded with ${getResponse.status}`
		);
	}

	const data: Client[] = z.array(client).parse(await getResponse.json());
	if (data.length == 0) {
		throw new Error(
			`Failed to fetch representation of client ${env.PUBLIC_KC_CLIENT_ID} in realm. Wrong client id`
		);
	}

	data[0].redirectUris.push(urlFromGuid(guid).href);

	const putResponse = await fetch(
		`${env.PUBLIC_KC_URL}/admin/realms/${env.PUBLIC_KC_REALM}/clients/${data[0].id}`,
		{
			body: JSON.stringify(data[0]),
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json'
			},
			method: 'PUT'
		}
	);
	if (!putResponse.ok) {
		throw new Error(
			`Failed to update settings of client ${env.PUBLIC_KC_CLIENT_ID} in realm. Keycloak responded with ${putResponse.status}`
		);
	}
}
