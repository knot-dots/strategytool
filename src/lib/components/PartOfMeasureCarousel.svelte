<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import fetchRelatedContainers from '$lib/client/fetchRelatedContainers';
	import Card from '$lib/components/Card.svelte';
	import {
		type ContainerWithEffect,
		isOverlayKey,
		overlayKey,
		paramsFromFragment,
		type PayloadType,
		payloadTypes,
		predicates
	} from '$lib/models';
	import { addEffectState, mayCreateContainer } from '$lib/stores';

	export let container: ContainerWithEffect;
	export let payloadType: PayloadType;

	$: containerRequest = fetchRelatedContainers(container.guid, {
		payloadType: [payloadType]
	});

	function addItemURL(url: URL) {
		const params = paramsFromFragment(url);

		const newParams = new URLSearchParams([
			...Array.from(params.entries()).filter(([k]) => !isOverlayKey(k)),
			[overlayKey.enum.create, payloadType],
			[predicates.enum['is-part-of'], String(container.revision)],
			[predicates.enum['is-part-of-measure'], String(container.revision)]
		]);

		return `#${newParams.toString()}`;
	}

	async function addEffect(target: ContainerWithEffect) {
		const params = new URLSearchParams([
			[overlayKey.enum.create, payloadTypes.enum.indicator],
			['alreadyInUse', '']
		]);

		for (const category of container.payload.category) {
			params.append('category', category);
		}

		for (const topic of container.payload.topic) {
			params.append('topic', topic);
		}

		for (const measureType of container.payload.measureType) {
			params.append('measureType', measureType);
		}

		$addEffectState = { target };

		await goto(`#${params.toString()}`);
	}
</script>

{#await containerRequest then containers}
	{#if containers.length > 0 || $mayCreateContainer(payloadType)}
		<div>
			{#if containers.length > 0}
				<ul class="carousel">
					{#each containers as container}
						<li>
							<Card --height="100%" {container} />
						</li>
					{/each}
				</ul>
			{/if}
			{#if $mayCreateContainer(payloadType)}
				<a
					class="button"
					href={addItemURL($page.url)}
					on:click|preventDefault={payloadType == payloadTypes.enum.effect
						? () => addEffect(container)
						: undefined}
				>
					{$_('add_item')}
				</a>
			{/if}
		</div>
	{/if}
{/await}
