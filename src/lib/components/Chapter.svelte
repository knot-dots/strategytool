<script lang="ts">
	import { onMount } from 'svelte';
	import { _, date, number } from 'svelte-i18n';
	import ChevronDoubleDown from '~icons/heroicons/chevron-double-down-20-solid';
	import ChevronDoubleUp from '~icons/heroicons/chevron-double-up-20-solid';
	import ChevronDown from '~icons/heroicons/chevron-down-20-solid';
	import ChevronUp from '~icons/heroicons/chevron-up-20-solid';
	import LightBulb from '~icons/heroicons/light-bulb-16-solid';
	import PlusSmall from '~icons/heroicons/plus-small-solid';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { env } from '$env/dynamic/public';
	import fetchContainers from '$lib/client/fetchContainers';
	import IndicatorChart from '$lib/components/IndicatorChart.svelte';
	import PartOfMeasureCarousel from '$lib/components/PartOfMeasureCarousel.svelte';
	import Progress from '$lib/components/Progress.svelte';
	import Summary from '$lib/components/Summary.svelte';
	import Viewer from '$lib/components/Viewer.svelte';
	import {
		containerOfType,
		isContainerWithEffect,
		isContainerWithObjective,
		isSimpleMeasureContainer,
		overlayKey,
		paramsFromFragment,
		payloadTypes,
		predicates,
		status
	} from '$lib/models';
	import type { Container, IndicatorContainer, Relation, StrategyContainer } from '$lib/models';
	import { ability } from '$lib/stores';
	import { statusColors, statusIcons } from '$lib/theme/models';

	export let headingTag: string;
	export let container: Container;
	export let isPartOf: StrategyContainer;

	let isPartOfRelation: Relation[];

	$: isPartOfRelation = isPartOf.relation.filter(
		({ object, predicate }) =>
			predicate == predicates.enum['is-part-of-strategy'] && object == isPartOf.revision
	);

	$: currentIndex = isPartOfRelation.findIndex(({ subject }) => container.revision == subject);

	function swap(x: number, y: number) {
		return ([...xs]) => (xs.length > 1 ? (([xs[x], xs[y]] = [xs[y], xs[x]]), xs) : xs);
	}

	function moveUp() {
		const swapCurrentPrevious = swap(currentIndex, currentIndex - 1);
		updateRelation(swapCurrentPrevious(isPartOfRelation));
	}

	function moveUp10() {
		updateRelation([
			...isPartOfRelation.slice(0, currentIndex - 10),
			isPartOfRelation[currentIndex],
			...isPartOfRelation.slice(currentIndex - 9, currentIndex),
			...isPartOfRelation.slice(currentIndex + 1)
		]);
	}

	function moveDown() {
		const swapCurrentNext = swap(currentIndex, currentIndex + 1);
		updateRelation(swapCurrentNext(isPartOfRelation));
	}

	function moveDown10() {
		updateRelation([
			...isPartOfRelation.slice(0, currentIndex),
			...isPartOfRelation.slice(currentIndex + 1, currentIndex + 10),
			isPartOfRelation[currentIndex],
			...isPartOfRelation.slice(currentIndex + 11)
		]);
	}

	async function updateRelation(relation: Relation[]) {
		const url = `/container/${isPartOf.guid}/relation`;

		const response = await fetch(url, {
			method: 'POST',
			body: JSON.stringify(relation),
			credentials: 'include',
			headers: {
				'Content-Type': 'application/json'
			}
		});

		if (response.ok) {
			await invalidateAll();
		}
	}

	function addChapterURL(url: URL, position: number) {
		const params = paramsFromFragment(url);
		params.set('create', payloadTypes.enum.undefined);
		params.set('is-part-of-strategy', String(isPartOf.revision));
		params.set('position', String(position));
		return `#${params.toString()}`;
	}

	function viewInOverlayURL(url: URL) {
		const params = paramsFromFragment(url);
		if (params.get(overlayKey.enum.view) === container.guid) {
			return '#';
		} else {
			return `#view=${container.guid}`;
		}
	}

	let indicatorsRequest: Promise<IndicatorContainer[]> = new Promise(() => []);

	onMount(() => {
		if ('objective' in container.payload && container.payload.objective.length > 0) {
			indicatorsRequest = fetchContainers({
				organization: [container.organization],
				payloadType: [payloadTypes.enum.indicator]
			}) as Promise<IndicatorContainer[]>;
		}
	});
</script>

<div class="chapter">
	<svelte:element this={headingTag} class="chapter-title">
		{container.payload.title}
		{#if $ability.can('update', isPartOf)}
			{#if currentIndex < isPartOfRelation.length - 1}
				<button class="icons-element" type="button" on:click={moveDown}>
					<ChevronDown />
				</button>
			{/if}
			{#if currentIndex < isPartOfRelation.length - 9}
				<button class="icons-element" type="button" on:click={moveDown10}>
					<ChevronDoubleDown />
				</button>
			{/if}
			{#if currentIndex > 8}
				<button class="icons-element" type="button" on:click={moveUp10}>
					<ChevronDoubleUp />
				</button>
			{/if}
			{#if currentIndex > 0}
				<button class="icons-element" type="button" on:click={moveUp}>
					<ChevronUp />
				</button>
			{/if}
		{/if}
	</svelte:element>

	{#if 'status' in container.payload}
		<p>
			<span class="badge badge--{statusColors.get(container.payload.status)}">
				<svelte:component this={statusIcons.get(container.payload.status) ?? LightBulb} />
				{$_(container.payload.status)}
			</span>
		</p>
	{/if}

	{#if 'summary' in container.payload || ('description' in container.payload && !isSimpleMeasureContainer(container))}
		<div class="summary">
			<h3>{$_('summary')}</h3>
			<Summary {container} />
		</div>
	{/if}

	{#if 'body' in container.payload}
		<Viewer value={container.payload.body} />
	{/if}

	{#if 'description' in container.payload}
		<Viewer value={container.payload.description} />
	{/if}

	{#if 'progress' in container.payload}
		<div class="progress">
			<h4>{$_('progress')}</h4>
			<Progress value={container.payload.progress} />
		</div>
	{/if}

	{#if 'annotation' in container.payload && (container.payload.status === status.enum['status.in_planning'] || isSimpleMeasureContainer(container))}
		<h4>{$_('annotation')}</h4>
		<Viewer value={container.payload.annotation} />
	{:else if 'comment' in container.payload && container.payload.status === status.enum['status.in_implementation']}
		<h4>{$_('comment')}</h4>
		<Viewer value={container.payload.comment} />
	{:else if 'result' in container.payload && (container.payload.status === status.enum['status.in_operation'] || container.payload.status === status.enum['status.done'])}
		<h4>{$_('result')}</h4>
		<Viewer value={container.payload.result} />
	{/if}

	{#if 'resource' in container.payload && container.payload.resource.length > 0}
		<h4>{$_('resources.label')}</h4>
		<ul>
			{#each container.payload.resource as resource}
				<li class="resource-item">
					<span>{resource.description}</span>
					<span>{resource.unit}</span>
					<span>{$number(resource.amount)}</span>
					<span>
						{$date(new Date(resource.fulfillmentDate), {
							day: '2-digit',
							month: '2-digit',
							year: 'numeric'
						})}
					</span>
				</li>
			{/each}
		</ul>
	{/if}

	{#if isContainerWithObjective(container) && container.payload.objective.length > 0}
		<div class="indicator-objective">
			<h4>{$_('objectives')}</h4>
			{#await indicatorsRequest then indicators}
				{@const indicatorsByGuid = new Map(indicators.map((ic) => [ic.guid, ic]))}
				{#each container.payload.objective as objective}
					{@const indicator = indicatorsByGuid.get(objective.indicator)}
					{#if indicator}
						<IndicatorChart
							container={indicator}
							containersWithObjectives={[container]}
							showObjectives
						>
							<a href="/indicator/{indicator.guid}" slot="caption">{indicator.payload.title}</a>
						</IndicatorChart>
					{/if}
				{/each}
			{/await}
		</div>
	{/if}

	{#if isContainerWithEffect(container)}
		<h4>{$_('effects')}</h4>
		<PartOfMeasureCarousel {container} payloadType={payloadTypes.enum.effect} />
	{/if}

	<footer class="content-actions">
		<a class="button" href={viewInOverlayURL($page.url)}>
			{$_('read_more')}
		</a>

		{#if $ability.can('create', containerOfType(payloadTypes.enum.undefined, $page.data.currentOrganization.guid, $page.data.currentOrganizationalUnit?.guid ?? null, env.PUBLIC_KC_REALM))}
			<a class="button" href={addChapterURL($page.url, currentIndex + 1)}>
				<PlusSmall />
				{$_('chapter')}
			</a>
		{/if}
	</footer>
</div>

<style>
	h4,
	p {
		margin: 0.875rem 0;
	}

	.chapter {
		margin-bottom: 1.5rem;
		max-width: 50rem;
	}

	.chapter-title {
		display: flex;
		font-size: 1.25rem;
		font-weight: 800;
		justify-content: space-between;
		margin-bottom: 0.875rem;
	}

	.chapter-title button {
		flex-shrink: 0;
	}

	.chapter-title button:first-of-type {
		margin-left: auto;
	}

	.content-actions {
		margin-top: 0.875rem;
	}
</style>
