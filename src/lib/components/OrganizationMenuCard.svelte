<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { env } from '$env/dynamic/public';
	import type { OrganizationalUnitContainer, OrganizationContainer } from '$lib/models';
	import { page } from '$app/stores';

	export let container: OrganizationContainer | OrganizationalUnitContainer;
	export let selectedContext: OrganizationContainer | OrganizationalUnitContainer | null;
	export let linkPath = `/${container.payload.type}/${container.guid}`;

	let organizationLink: HTMLAnchorElement;

	function handleClick(event: MouseEvent) {
		if (organizationLink == event.target) {
			return;
		}
		const isTextSelected = window.getSelection()?.toString();
		if (!isTextSelected) {
			organizationLink.click();
		}
	}

	function handleKeyUp(event: KeyboardEvent) {
		if (event.key == 'Enter') {
			organizationLink.click();
		}
	}

	function organizationURL(container: OrganizationContainer | OrganizationalUnitContainer) {
		const url = new URL(env.PUBLIC_BASE_URL ?? '');
		url.hostname = `${container.guid}.${url.hostname}`;
		url.pathname = linkPath;
		return url.toString();
	}
</script>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<article
	tabindex="-1"
	title={container.payload.name}
	data-sveltekit-keepfocus
	class="card"
	class:is-active={$page.url.hostname.split('.')[0] === container.guid}
	on:click={handleClick}
	on:keyup={handleKeyUp}
>
	<header>
		<h3>
			<a href={organizationURL(container)} bind:this={organizationLink}>
				{container.payload.name}
			</a>
		</h3>
	</header>

	{#if 'image' in container.payload}
		<img alt={$_('image')} class="text" src={container.payload.image} />
	{/if}

	<footer>
		{#if 'organizationCategory' in container.payload && container.payload.organizationCategory}
			<span class="badge">
				{$_(container.payload.organizationCategory)}
			</span>
		{/if}

		<button
			class="relation-button"
			title={$_('show_related_objects')}
			type="button"
			class:is-active={container.guid === selectedContext?.guid}
			on:click|stopPropagation={() => {
				selectedContext = container.guid === selectedContext?.guid ? null : container;
			}}
		>
		</button>
	</footer>
</article>

<style>
	.card {
		background: #ffffff;
		border: 1px solid var(--color-gray-200);
		border-radius: 8px;
		box-shadow: var(--shadow-md);
		cursor: pointer;
		display: flex;
		flex-direction: column;
		padding: 1.25rem;
		height: var(--height, auto);
		width: 100%;
	}

	.card:hover,
	.card.is-active {
		border-color: var(--hover-border-color, var(--color-hover-neutral));
		border-width: 3px;
		outline: none;
		padding: calc(1.25rem - 2px);
	}

	header {
		margin-bottom: 1rem;
	}

	header h3 {
		font-size: 1rem;
		font-weight: 700;
	}

	.text {
		color: var(--color-gray-500);
		font-size: 0.875rem;
		font-weight: 500;
		margin-bottom: 1rem;
	}

	img {
		max-height: 7rem;
		object-fit: contain;
	}

	footer {
		display: flex;
		margin-top: auto;
	}
</style>
