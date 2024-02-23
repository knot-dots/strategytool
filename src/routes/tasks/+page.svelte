<script lang="ts">
	import { browser } from '$app/environment';
	import Board from '$lib/components/Board.svelte';
	import Layout from '$lib/components/Layout.svelte';
	import Overlay from '$lib/components/Overlay.svelte';
	import Search from '$lib/components/Search.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Sort from '$lib/components/Sort.svelte';
	import TaskBoardColumn from '$lib/components/TaskBoardColumn.svelte';
	import TaskCategoryFilter from '$lib/components/TaskCategoryFilter.svelte';
	import TaskIncludedFilter from '$lib/components/TaskIncludedFilter.svelte';
	import { isTaskContainer, payloadTypes, taskStatus } from '$lib/models';
	import type { TaskContainer } from '$lib/models';
	import { overlay, sidebarToggle } from '$lib/stores';
	import { taskStatusBackgrounds, taskStatusHoverColors, taskStatusIcons } from '$lib/theme/models';
	import type { PageData } from './$types';

	export let data: PageData;

	$: columns = [
		{
			title: taskStatus.enum['task_status.idea'],
			payloadType: payloadTypes.enum['internal_objective.task'],
			items: data.containers.filter(
				(c) => isTaskContainer(c) && c.payload.taskStatus === taskStatus.enum['task_status.idea']
			) as TaskContainer[]
		},
		{
			title: taskStatus.enum['task_status.in_planning'],
			payloadType: payloadTypes.enum['internal_objective.task'],
			items: data.containers.filter(
				(c) =>
					isTaskContainer(c) && c.payload.taskStatus === taskStatus.enum['task_status.in_planning']
			) as TaskContainer[]
		},
		{
			title: taskStatus.enum['task_status.in_progress'],
			payloadType: payloadTypes.enum['internal_objective.task'],
			items: data.containers.filter(
				(c) =>
					isTaskContainer(c) && c.payload.taskStatus === taskStatus.enum['task_status.in_progress']
			) as TaskContainer[]
		},
		{
			title: taskStatus.enum['task_status.done'],
			payloadType: payloadTypes.enum['internal_objective.task'],
			items: data.containers.filter(
				(c) => isTaskContainer(c) && c.payload.taskStatus === taskStatus.enum['task_status.done']
			) as TaskContainer[]
		}
	];
</script>

<Layout>
	<Sidebar helpSlug="tasks" slot="sidebar">
		<Search slot="search" let:toggleSidebar on:click={$sidebarToggle ? undefined : toggleSidebar} />
		<svelte:fragment slot="filters">
			<TaskIncludedFilter />
			<TaskCategoryFilter />
		</svelte:fragment>
		<Sort slot="sort" />
	</Sidebar>

	<svelte:fragment slot="main">
		<Board>
			{#each columns as column (column.title)}
				<TaskBoardColumn
					--background={taskStatusBackgrounds.get(column.title)}
					--hover-border-color={taskStatusHoverColors.get(column.title)}
					addItemUrl="#create={column.payloadType}&taskStatus={column.title}"
					icon={taskStatusIcons.get(column.title)}
					items={column.items}
					status={column.title}
				/>
			{/each}
		</Board>

		{#if browser && $overlay.revisions.length > 0}
			<Overlay {...$overlay} />
		{/if}
	</svelte:fragment>
</Layout>