<script lang="ts">
	import { _, date, number } from 'svelte-i18n';
	import ArrowDownTray from '~icons/heroicons/arrow-down-tray-20-solid';
	import LightBulb from '~icons/heroicons/light-bulb-16-solid';
	import Pencil from '~icons/heroicons/pencil-solid';
	import { page } from '$app/stores';
	import fetchMembers from '$lib/client/fetchMembers';
	import paramsFromURL from '$lib/client/paramsFromURL';
	import PartOfMeasureCarousel from '$lib/components/PartOfMeasureCarousel.svelte';
	import Progress from '$lib/components/Progress.svelte';
	import Summary from '$lib/components/Summary.svelte';
	import Viewer from '$lib/components/Viewer.svelte';
	import {
		getCreator,
		isMeasureContainer,
		isSimpleMeasureContainer,
		isStrategyContainer,
		overlayKey,
		owners,
		payloadTypes,
		status
	} from '$lib/models';
	import type { AnyContainer, Container, ContainerWithEffect } from '$lib/models';
	import { sdgIcons, statusColors, statusIcons } from '$lib/theme/models';
	import { ability, applicationState } from '$lib/stores';

	export let container: ContainerWithEffect;
	export let relatedContainers: Container[];
	export let revisions: AnyContainer[];

	applicationState.update((state) => ({
		...state,
		containerDetailView: {
			activeTab: 'basic-data',
			tabs: ['basic-data', 'resources', 'effects', 'milestones']
		}
	}));

	let selectedRevision: ContainerWithEffect;

	$: {
		const parseResult = status.safeParse(paramsFromURL($page.url).get('status'));
		if (parseResult.success) {
			selectedRevision =
				(revisions as ContainerWithEffect[]).findLast(
					({ payload }) => payload.status == parseResult.data
				) ?? container;
		} else {
			selectedRevision = container;
		}
	}

	$: strategy = relatedContainers.find(isStrategyContainer);

	let isPage = $page.url.pathname == `/${container.payload.type}/${container.guid}`;

	function containerURL(type: string, guid: string) {
		if (isPage) {
			return `/${type}/${guid}`;
		} else {
			const query = paramsFromURL($page.url);
			query.set(overlayKey.enum.view, guid);
			return `#${query.toString()}`;
		}
	}

	$: organizationMembersRequest = fetchMembers(container.organization);
</script>

<article class="details">
	<div class="details-tab" id="basic-data">
		<h2 class="details-title">
			{container.payload.title}
			{#if $ability.can('update', container)}
				<a class="button button-square quiet" href="#view={container.guid}&edit">
					<Pencil />
				</a>
			{/if}
		</h2>

		{#if 'summary' in container.payload || 'description' in container.payload !isSimpleMeasureContainer(container) && }
			<div class="summary">
				<h3>{$_('summary')}</h3>
				<Summary container={selectedRevision} />
			</div>
		{/if}

		{#if 'description' in container.payload}
			<div class="description">
				<h3>{isMeasureContainer(container) ? $_('measure.description') : $_('description')}</h3>
				<Viewer value={selectedRevision.payload.description} />
			</div>
		{/if}

		{#if 'progress' in selectedRevision.payload}
			<div class="progress">
				<h3>{$_('progress')}</h3>
				<Progress value={selectedRevision.payload.progress} />
			</div>
		{/if}

		{#if 'annotation' in selectedRevision.payload && (selectedRevision.payload.status === status.enum['status.in_planning'] || isSimpleMeasureContainer(selectedRevision))}
			<div class="annotation">
				<h3>{$_('annotation')}</h3>
				<Viewer value={selectedRevision.payload.annotation} />
			</div>
		{:else if 'comment' in selectedRevision.payload && selectedRevision.payload.status === status.enum['status.in_implementation']}
			<div class="comment">
				<h3>{$_('comment')}</h3>
				<Viewer value={selectedRevision.payload.comment} />
			</div>
		{:else if 'result' in selectedRevision.payload && (selectedRevision.payload.status === status.enum['status.in_operation'] || selectedRevision.payload.status === status.enum['status.done'])}
			<div class="result">
				<h3>{$_('result')}</h3>
				<Viewer value={selectedRevision.payload.result} />
			</div>
		{/if}

		{#if 'file' in container.payload && container.payload.file.length > 0}
			<div class="meta">
				<h3 class="meta-key">{$_('files')}</h3>
				<ul class="meta-value">
					{#each container.payload.file as file}
						<li>
							<a href={file[0]}>
								{file[1]}
								<ArrowDownTray />
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<div class="meta">
			<h3 class="meta-key">{$_('object')}</h3>
			<p class="meta-value">{$_(selectedRevision.payload.type)}</p>
		</div>

		{#if strategy}
			<div class="meta">
				<h3 class="meta-key">{$_('strategy')}</h3>
				<p class="meta-value">
					{#if $page.url.pathname === `/strategy/${strategy.guid}`}
						{$_(strategy.payload.title)}
					{:else}
						<a href={containerURL(strategy.payload.type, strategy.guid)}>
							{$_(strategy.payload.title)}
						</a>
					{/if}
				</p>
			</div>

			<div class="meta">
				<h3 class="meta-key">{$_('strategy_type.label')}</h3>
				<p class="meta-value">{$_(strategy.payload.strategyType)}</p>
			</div>
		{/if}

		{#if 'measureType' in container.payload}
			<div class="meta">
				<h3 class="meta-key">{$_('measure_type')}</h3>
				<ul class="meta-value">
					{#each container.payload.measureType as measureType}
						<li>{$_(measureType)}</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if 'topic' in container.payload}
			<div class="meta">
				<h3 class="meta-key">{$_('topic.label')}</h3>
				<ul class="meta-value meta-value--topic">
					{#each selectedRevision.payload.topic as topic}
						<li>{$_(topic)}</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if 'category' in container.payload}
			<div class="meta">
				<h3 class="meta-key">{$_('category')}</h3>
				<ul class="meta-value meta-value--category">
					{#each selectedRevision.payload.category as category}
						<li>
							<img
								src={sdgIcons.get(category)}
								alt={$_(category)}
								title={$_(category)}
								width="66"
								height="66"
							/>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<div class="meta">
			<h3 class="meta-key">{$_('status.label')}</h3>
			<p class="meta-value">
				<span class="badge badge--{statusColors.get(selectedRevision.payload.status)}">
					<svelte:component this={statusIcons.get(selectedRevision.payload.status) ?? LightBulb} />
					{$_(selectedRevision.payload.status)}
				</span>
			</p>
		</div>

		<div class="meta">
			<h3 class="meta-key">{$_('owned_by')}</h3>
			<ul class="meta-value">
				{#each owners( container, [...$page.data.organizations, ...$page.data.organizationalUnits] ) as owner}
					<li>{owner.payload.name}</li>
				{/each}
			</ul>
		</div>

		{#if 'audience' in container.payload}
			<div class="meta">
				<h3 class="meta-key">{$_('audience')}</h3>
				<ul class="meta-value">
					{#each container.payload.audience as audience}
						<li>{$_(audience)}</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if 'startDate' in container.payload || 'endDate' in container.payload}
			<div class="meta">
				<h3 class="meta-key">{$_('planned_duration')}</h3>
				<p class="meta-value">
					{#if selectedRevision.payload.startDate && selectedRevision.payload.endDate}
						{$date(new Date(selectedRevision.payload.startDate), { format: 'short' })}–{$date(
							new Date(selectedRevision.payload.endDate),
							{
								format: 'short'
							}
						)}
					{:else if selectedRevision.payload.startDate}
						{$date(new Date(selectedRevision.payload.startDate), { format: 'short' })}–
					{/if}
				</p>
			</div>
		{/if}

		{#await organizationMembersRequest then organizationMembers}
			{@const organizationMembersByGuid = new Map(organizationMembers.map((m) => [m.guid, m]))}
			<div class="meta">
				<h3 class="meta-key">{$_('created_date')}</h3>
				<ul class="meta-value">
					<li>
						{getCreator(revisions[0]).some((guid) => organizationMembersByGuid.has(guid))
							? $_('created_by', {
									values: {
										date: revisions[0].valid_from,
										creator: getCreator(revisions[0])
											.filter((guid) => organizationMembersByGuid.has(guid))
											.map((guid) => organizationMembersByGuid.get(guid)?.display_name)
											.join(', ')
									}
								})
							: $date(revisions[0].valid_from, { format: 'long' })}
					</li>
				</ul>
			</div>

			<div class="meta">
				<h3 class="meta-key">{$_('modified_date')}</h3>
				<ul class="meta-value">
					<li>
						{getCreator(container).some((guid) => organizationMembersByGuid.has(guid))
							? $_('created_by', {
									values: {
										date: container.valid_from,
										creator: getCreator(container)
											.filter((guid) => organizationMembersByGuid.has(guid))
											.map((guid) => organizationMembersByGuid.get(guid)?.display_name)
											.join(', ')
									}
								})
							: $date(container.valid_from, { format: 'long' })}
					</li>
				</ul>
			</div>
		{/await}

		{#if $ability.can('read', container, 'visibility')}
			<div class="meta">
				<h3 class="meta-key">{$_('visible_for')}</h3>
				<ul class="meta-value">
					<li>{$_(`visibility.${container.payload.visibility}`)}</li>
				</ul>
			</div>
		{/if}
	</div>

	{#if selectedRevision.payload.resource.length > 0}
		<div class="details-tab" id="resources">
			<h3>{$_('resources.label')}</h3>
			<ul>
				{#each selectedRevision.payload.resource as resource}
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
		</div>
	{/if}

	<div class="details-tab" id="effects">
		<h3>{$_('effects')}</h3>
		<PartOfMeasureCarousel {container} payloadType={payloadTypes.enum.effect} />
	</div>

	<div class="details-tab" id="measure-results">
		<h3>{$_('measure_results')}</h3>
		<PartOfMeasureCarousel {container} payloadType={payloadTypes.enum.measure_result} />
	</div>

	<div class="details-tab" id="milestones">
		<h3>{$_('milestones')}</h3>
		<PartOfMeasureCarousel {container} payloadType={payloadTypes.enum.milestone} />
	</div>
</article>

<style>
	.resource-item {
		border-bottom: solid 1px var(--color-gray-300);
		column-gap: 1rem;
		display: flex;
		flex-wrap: wrap;
		margin-bottom: 0.5rem;
		padding-bottom: 0.5rem;
	}

	.resource-item > * {
		flex: 0 1 0;
	}

	.resource-item > :nth-child(1) {
		flex: 1 0 100%;
	}

	.resource-item > :nth-child(3) {
		text-align: right;
	}
</style>
