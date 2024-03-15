<script lang="ts">
	import { getContext, setContext } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { slide } from 'svelte/transition';
	import Pencil from '~icons/heroicons/pencil-solid';
	import Trash from '~icons/heroicons/trash';
	import Maximize from '~icons/knotdots/maximize';
	import Minimize from '~icons/knotdots/minimize';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import deleteContainer from '$lib/client/deleteContainer';
	import paramsFromURL from '$lib/client/paramsFromURL';
	import saveContainer from '$lib/client/saveContainer';
	import AudienceFilter from '$lib/components/AudienceFilter.svelte';
	import CategoryFilter from '$lib/components/CategoryFilter.svelte';
	import ContainerDetailView from '$lib/components/ContainerDetailView.svelte';
	import ContainerDetailViewTabs from '$lib/components/ContainerDetailViewTabs.svelte';
	import ContainerForm from '$lib/components/ContainerForm.svelte';
	import ContainerFormTabs from '$lib/components/ContainerFormTabs.svelte';
	import IndicatorDetailView from '$lib/components/IndicatorDetailView.svelte';
	import IndicatorTabs from '$lib/components/IndicatorTabs.svelte';
	import InternalObjectiveDetailView from '$lib/components/InternalObjectiveDetailView.svelte';
	import InternalObjectives from '$lib/components/InternalObjectives.svelte';
	import InternalObjectiveTaskDetailView from '$lib/components/InternalObjectiveTaskDetailView.svelte';
	import MeasureDetailView from '$lib/components/MeasureDetailView.svelte';
	import MeasureStatusTabs from '$lib/components/MeasureStatusTabs.svelte';
	import Members from '$lib/components/Members.svelte';
	import OverlayNavigation from '$lib/components/OverlayNavigation.svelte';
	import PageDetailView from '$lib/components/PageDetailView.svelte';
	import PayloadTypeFilter from '$lib/components/PayloadTypeFilter.svelte';
	import Relations from '$lib/components/Relations.svelte';
	import RelationTypeFilter from '$lib/components/RelationTypeFilter.svelte';
	import Search from '$lib/components/Search.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Sort from '$lib/components/Sort.svelte';
	import StrategyDetailView from '$lib/components/StrategyDetailView.svelte';
	import StrategyTypeFilter from '$lib/components/StrategyTypeFilter.svelte';
	import TaskCategoryFilter from '$lib/components/TaskCategoryFilter.svelte';
	import TaskStatusTabs from '$lib/components/TaskStatusTabs.svelte';
	import Tasks from '$lib/components/Tasks.svelte';
	import TopicFilter from '$lib/components/TopicFilter.svelte';
	import Visibility from '$lib/components/Visibility.svelte';
	import {
		isContainer,
		isContainerWithEffect,
		isIndicatorContainer,
		isInternalObjectiveContainer,
		isOrganizationalUnitContainer,
		isPageContainer,
		isStrategyContainer,
		isTaskContainer,
		mayDelete,
		newIndicatorTemplateFromIndicator,
		overlayKey,
		payloadTypes,
		quantities
	} from '$lib/models';
	import type {
		AnyContainer,
		Container,
		ContainerWithObjective,
		CustomEventMap,
		IndicatorContainer,
		OrganizationContainer,
		OrganizationalUnitContainer,
		TaskContainer,
		User
	} from '$lib/models';
	import { ability, applicationState, overlayWidth } from '$lib/stores';
	import AssigneeFilter from '$lib/components/AssigneeFilter.svelte';

	export let containersWithObjectives: ContainerWithObjective[] = [];
	export let internalObjectives: Container[] | undefined = undefined;
	export let isPartOfOptions: AnyContainer[];
	export let relatedContainers: Container[];
	export let revisions: AnyContainer[];
	export let tasks: TaskContainer[] | undefined = undefined;
	export let users: User[] | undefined = undefined;

	setContext('overlay', true);

	let container: AnyContainer;
	let mayShowRelationButton = getContext('mayShowRelationButton');
	let saveAsIndicatorTemplateDisabled = false;

	$: {
		container = revisions[revisions.length - 1];
		saveAsIndicatorTemplateDisabled = false;
	}

	$: hashParams = paramsFromURL($page.url);
	$: edit = hashParams.has(overlayKey.enum.create) || hashParams.has(overlayKey.enum.edit);

	function closeURL() {
		if (hashParams.has(overlayKey.enum['view-help'])) {
			const newParams = new URLSearchParams(
				[...hashParams.entries()].filter(([key]) => key != overlayKey.enum['view-help'])
			);
			return `#${newParams.toString()}`;
		} else {
			const newParams = new URLSearchParams(
				[...hashParams.entries()].filter(([key]) => key == overlayKey.enum.relate)
			);
			return `#${newParams.toString()}`;
		}
	}

	function cancelURL() {
		const newParams = new URLSearchParams(hashParams);

		if (newParams.has(overlayKey.enum['edit-help'])) {
			newParams.delete(overlayKey.enum['edit-help']);
		} else {
			newParams.delete(overlayKey.enum.create);
			newParams.delete(overlayKey.enum.edit);
		}

		return `#${newParams.toString()}`;
	}

	function editHelpURL() {
		const newParams = new URLSearchParams(hashParams);
		newParams.set(overlayKey.enum['edit-help'], '');
		return `#${newParams.toString()}`;
	}

	async function afterSubmit(
		{ detail }: CustomEvent<CustomEventMap['submitSuccessful']>,
		c: AnyContainer
	) {
		await invalidateAll();
		if (
			detail.event.submitter?.id === 'save-and-next' &&
			$applicationState.containerForm.activeTab
		) {
			await goto(`#view=${detail.result.guid}&edit`);
			$applicationState.containerForm.activeTab =
				$applicationState.containerForm.tabs[
					$applicationState.containerForm.tabs.findIndex(
						(value) => value === $applicationState.containerForm.activeTab
					) + 1
				];
		} else if (hashParams.has('create')) {
			await goto(`#view=${detail.result.guid}`);
		} else if (hashParams.has('edit-help')) {
			const newParams = new URLSearchParams(hashParams);
			newParams.delete('edit-help');
			await goto(`#${newParams.toString()}`);
		} else {
			await goto(`#view=${c.guid}`);
		}
	}

	async function handleDelete(c: AnyContainer) {
		const response = await deleteContainer(c);
		if (response.ok) {
			await invalidateAll();
			await goto(closeURL());
		}
	}

	function saveIndicatorAsTemplate(c: IndicatorContainer) {
		return async () => {
			saveAsIndicatorTemplateDisabled = true;
			await saveContainer(newIndicatorTemplateFromIndicator(c));
		};
	}

	let fullScreen = false;

	function toggleFullscreen() {
		fullScreen = !fullScreen;
	}

	let offset = 0;

	function startExpand(event: MouseEvent) {
		offset = event.offsetX - 12;
		window.addEventListener('mousemove', expand);
	}

	function stopExpand() {
		window.removeEventListener('mousemove', expand);
	}

	function expand(event: MouseEvent) {
		$overlayWidth = (window.innerWidth - event.pageX + offset) / window.innerWidth;

		if ($overlayWidth * window.innerWidth < 320) {
			$overlayWidth = 320 / window.innerWidth;
		} else if ($overlayWidth * window.innerWidth > window.innerWidth - 400) {
			$overlayWidth = 1 - 400 / window.innerWidth;
		}
	}
</script>

<svelte:window on:mouseup={stopExpand} />

<section
	class="overlay"
	class:overlay-fullscreen={fullScreen}
	transition:slide={{ axis: 'x' }}
	style="--width-factor: {$overlayWidth}"
>
	<!--svelte-ignore a11y-no-static-element-interactions -->
	<div class="resize-handle" on:mousedown|preventDefault={startExpand} />
	<OverlayNavigation {container} />
	{#if isPageContainer(container) && hashParams.has(overlayKey.enum['edit-help'])}
		<aside>
			<Sidebar>
				<svelte:fragment slot="extra">
					<li>
						<button
							class="button-nav button-square"
							on:click={toggleFullscreen}
							title={$_('full_screen')}
						>
							{#if fullScreen}<Minimize />{:else}<Maximize />{/if}
						</button>
					</li>
				</svelte:fragment>
			</Sidebar>
		</aside>
		<div class="content-details masked-overflow">
			<ContainerForm
				bind:container
				isPartOfOptions={[]}
				on:submitSuccessful={(e) => afterSubmit(e, container)}
			/>
		</div>
		<footer class="content-footer">
			<div class="content-actions">
				<button class="primary" form="container-form" type="submit">{$_('save')}</button>
				<a class="button" href={cancelURL()}>{$_('cancel')}</a>
			</div>
		</footer>
	{:else if isPageContainer(container) && hashParams.has(overlayKey.enum['view-help'])}
		<aside>
			<Sidebar>
				<svelte:fragment slot="extra">
					<li>
						<button
							class="button-nav button-square"
							on:click={toggleFullscreen}
							title={$_('full_screen')}
						>
							{#if fullScreen}<Minimize />{:else}<Maximize />{/if}
						</button>
					</li>
					{#if $ability.can('update', container)}
						<li>
							<a class="button button-nav button-square" href={editHelpURL()}>
								<Pencil />
							</a>
						</li>
					{/if}
				</svelte:fragment>
			</Sidebar>
		</aside>
		<div class="content-details masked-overflow">
			<PageDetailView {container} />
		</div>
		<footer class="content-footer">
			<div class="content-actions"></div>
		</footer>
	{:else if edit}
		<aside>
			<Sidebar helpSlug={`${container.payload.type.replace('_', '-')}-edit`}>
				<ContainerFormTabs {container} slot="tabs" />
				<svelte:fragment slot="extra">
					<li>
						<button
							class="button-nav button-square"
							on:click={toggleFullscreen}
							title={$_('full_screen')}
						>
							{#if fullScreen}<Minimize />{:else}<Maximize />{/if}
						</button>
					</li>
				</svelte:fragment>
			</Sidebar>
		</aside>
		<div class="content-details masked-overflow">
			<ContainerForm
				bind:container
				{isPartOfOptions}
				on:submitSuccessful={(e) => afterSubmit(e, container)}
			/>
		</div>
		<footer class="content-footer">
			{#if container.payload.type !== payloadTypes.enum.undefined}
				<Visibility {container} />
			{/if}
			<div class="content-actions">
				{#if container.payload.type !== payloadTypes.enum.undefined}
					{#if $applicationState.containerForm.activeTab !== $applicationState.containerForm.tabs[$applicationState.containerForm.tabs.length - 1]}
						<button form="container-form" type="submit">{$_('save')}</button>
						<button class="primary" id="save-and-next" form="container-form" type="submit">
							{$_('save_and_next')}
						</button>
					{:else}
						<button class="primary" form="container-form" type="submit">{$_('save')}</button>
					{/if}
				{/if}
				<a class="button" href={cancelURL()}>{$_('cancel')}</a>
				{#if mayDelete(container)}
					<button
						class="delete quiet"
						title={$_('delete')}
						type="button"
						on:click={() => handleDelete(container)}
					>
						<Trash />
					</button>
				{/if}
			</div>
		</footer>
	{:else if hashParams.has(overlayKey.enum.members) && users}
		<aside>
			<Sidebar helpSlug="members">
				<svelte:fragment slot="extra">
					<li>
						<button
							class="button-nav button-square"
							on:click={toggleFullscreen}
							title={$_('full_screen')}
						>
							{#if fullScreen}<Minimize />{:else}<Maximize />{/if}
						</button>
					</li>
				</svelte:fragment>
			</Sidebar>
		</aside>
		<div class="content-details masked-overflow">
			<Members {container} {users} />
		</div>
	{:else if hashParams.has(overlayKey.enum.relations) && relatedContainers}
		<aside>
			<Sidebar helpSlug="relations">
				<Search slot="search" />
				<svelte:fragment slot="filters">
					<AudienceFilter />
					<RelationTypeFilter />
					<StrategyTypeFilter />
					<TopicFilter />
					<CategoryFilter />
				</svelte:fragment>
				<Sort slot="sort" />
				<svelte:fragment slot="extra">
					<li>
						<button
							class="button-nav button-square"
							on:click={toggleFullscreen}
							title={$_('full_screen')}
						>
							{#if fullScreen}<Minimize />{:else}<Maximize />{/if}
						</button>
					</li>
				</svelte:fragment>
			</Sidebar>
		</aside>
		<Relations containers={relatedContainers} />
	{:else if hashParams.has(overlayKey.enum['internal-objectives']) && internalObjectives}
		<aside>
			<Sidebar helpSlug="internal-objectives">
				<Search slot="search" />
				<Sort slot="sort" />
				<svelte:fragment slot="extra">
					<li>
						<button
							class="button-nav button-square"
							on:click={toggleFullscreen}
							title={$_('full_screen')}
						>
							{#if fullScreen}<Minimize />{:else}<Maximize />{/if}
						</button>
					</li>
				</svelte:fragment>
			</Sidebar>
		</aside>
		<InternalObjectives {container} containers={internalObjectives} />
	{:else if hashParams.has(overlayKey.enum.tasks) && tasks}
		<aside>
			<Sidebar helpSlug="tasks">
				<Search slot="search" />
				<svelte:fragment slot="filters">
					<TaskCategoryFilter />
					<AssigneeFilter options={tasks.map(({ payload }) => payload.assignee)} />
				</svelte:fragment>
				<svelte:fragment slot="extra">
					<li>
						<button
							class="button-nav button-square"
							on:click={toggleFullscreen}
							title={$_('full_screen')}
						>
							{#if fullScreen}<Minimize />{:else}<Maximize />{/if}
						</button>
					</li>
				</svelte:fragment>
			</Sidebar>
		</aside>
		<Tasks {container} containers={tasks} />
	{:else}
		{#if 'guid' in container}
			<aside>
				{#if isStrategyContainer(container)}
					<Sidebar helpSlug={`container.payload.type.replace('_', '-')}-view`}>
						<svelte:fragment slot="filters">
							<PayloadTypeFilter
								options={Array.from(new Set(relatedContainers.map(({ payload }) => payload.type)))}
							/>
							<CategoryFilter />
							<TopicFilter />
						</svelte:fragment>
						<ContainerDetailViewTabs {container} slot="tabs" />
						<svelte:fragment slot="extra">
							<li>
								<button
									class="button-nav button-square"
									on:click={toggleFullscreen}
									title={$_('full_screen')}
								>
									{#if fullScreen}<Minimize />{:else}<Maximize />{/if}
								</button>
							</li>
							{#if $ability.can('update', container)}
								<li>
									<a class="button button-nav button-square" href="#view={container.guid}&edit">
										<Pencil />
									</a>
								</li>
							{/if}
						</svelte:fragment>
					</Sidebar>
				{:else}
					<Sidebar helpSlug={`container.payload.type.replace('_', '-')}-view`}>
						<ContainerDetailViewTabs {container} slot="tabs" />
						<svelte:fragment slot="extra">
							<li>
								<button
									class="button-nav button-square"
									on:click={toggleFullscreen}
									title={$_('full_screen')}
								>
									{#if fullScreen}<Minimize />{:else}<Maximize />{/if}
								</button>
							</li>
							{#if $ability.can('update', container)}
								<li>
									<a class="button button-nav button-square" href="#view={container.guid}&edit">
										<Pencil />
									</a>
								</li>
							{/if}
						</svelte:fragment>
					</Sidebar>
				{/if}
			</aside>
		{/if}
		{#if isIndicatorContainer(container)}
			<header class="content-header">
				<IndicatorTabs />
			</header>
		{:else if isContainerWithEffect(container)}
			<header class="content-header">
				<MeasureStatusTabs {container} {revisions} />
			</header>
		{:else if isTaskContainer(container)}
			<header class="content-header">
				<TaskStatusTabs {container} {revisions} />
			</header>
		{/if}
		<div class="content-details masked-overflow">
			{#if isIndicatorContainer(container)}
				<IndicatorDetailView
					{container}
					{containersWithObjectives}
					{relatedContainers}
					{revisions}
				/>
			{:else if isContainerWithEffect(container)}
				<MeasureDetailView {container} {relatedContainers} {revisions} />
			{:else if isTaskContainer(container)}
				<InternalObjectiveTaskDetailView {container} {relatedContainers} {revisions} />
			{:else if isInternalObjectiveContainer(container)}
				<InternalObjectiveDetailView {container} {relatedContainers} {revisions} />
			{:else if isStrategyContainer(container)}
				<StrategyDetailView {container} {relatedContainers} {revisions} />
			{:else if isOrganizationalUnitContainer(container)}
				<ContainerDetailView {container} {relatedContainers} {revisions} />
			{:else if isContainer(container)}
				<ContainerDetailView {container} {relatedContainers} {revisions} />
			{/if}
		</div>
		<footer class="content-footer">
			<div class="content-actions">
				{#if mayShowRelationButton && $ability.can('relate', container)}
					<a class="button" href="#relate={container.guid}">
						{$_('relations')}
					</a>
				{/if}
				{#if isIndicatorContainer(container) && container.payload.quantity === quantities.enum['quantity.custom'] && $ability.can('create', payloadTypes.enum.indicator_template)}
					<button
						type="button"
						on:click={saveIndicatorAsTemplate(container)}
						disabled={saveAsIndicatorTemplateDisabled}
					>
						{$_('indicator.save_as_template')}
					</button>
				{/if}
			</div>
		</footer>
	{/if}
</section>

<style>
	.overlay.overlay-fullscreen {
		margin-left: -3.875rem;
		width: 100vw;
	}

	.overlay > aside {
		font-size: 0.875rem;
		height: calc(100vh - var(--nav-height));
		min-width: 0;
		padding: 1.5rem 0.5rem 0.5rem;
		position: absolute;
		top: var(--nav-height);
		width: 3.5rem;
	}

	.overlay > aside ~ :global(*) {
		margin-left: 3.5rem;
	}

	@media (min-width: 768px) {
		.overlay {
			--width-factor: 0.65;

			width: calc(100% * var(--width-factor));
		}

		.overlay > * {
			min-width: calc(100vw * var(--width-factor) - 3.5rem);
		}

		.overlay > :global(nav) {
			min-width: calc(100vw * var(--width-factor));
		}
	}

	.resize-handle {
		background-image: url(/src/lib/assets/resize-handle.svg);
		background-position: 2px center;
		background-repeat: no-repeat;
		background-clip: border-box;
		border-right: solid 2px transparent;
		cursor: ew-resize;
		height: 100%;
		left: -0.75rem;
		min-width: 0;
		position: absolute;
		width: 0.75rem;
		z-index: 1;
	}

	.resize-handle:active,
	.resize-handle:hover {
		border-color: var(--focus-color);
	}
</style>
