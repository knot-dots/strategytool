<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Card from '$lib/components/Card.svelte';
	import Viewer from '$lib/components/Viewer.svelte';
	import type { Container, OrganizationalUnitContainer, OrganizationContainer } from '$lib/models';

	export let container: OrganizationContainer | OrganizationalUnitContainer;
	export let indicators: Container[];
	export let measures: Container[];
	export let strategies: Container[];
</script>

<article class="details">
	<h2 class="details-title">
		{#if 'image' in container.payload}
			<img alt="logo" class="logo" src={container.payload.image} />
		{/if}
		{container.payload.name}
	</h2>

	<slot name="data">
		{#if 'description' in container.payload}
			<div class="description">
				<h3>{$_('description')}</h3>
				<Viewer value={container.payload.description} />
			</div>
		{/if}
	</slot>

	{#if container.payload.boards.includes('board.indicators')}
		<div class="indicators">
			<h3>{$_('indicators')}</h3>
			<ul class="carousel">
				{#each indicators as indicator}
					<li>
						<Card --height="100%" container={indicator} />
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div class="strategies">
		<h3>{$_('strategies')}</h3>
		<ul class="carousel">
			{#each strategies as strategy}
				<li>
					<Card --height="100%" container={strategy} />
				</li>
			{/each}
		</ul>
	</div>

	<div class="measures">
		<h3>{$_('measures')}</h3>
		<ul class="carousel">
			{#each measures as measure}
				<li>
					<Card --height="100%" container={measure} />
				</li>
			{/each}
		</ul>
	</div>
</article>
