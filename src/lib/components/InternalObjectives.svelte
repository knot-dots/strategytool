<script lang="ts">
	import { setContext } from 'svelte';
	import { _ } from 'svelte-i18n';
	import Board from '$lib/components/Board.svelte';
	import BoardColumn from '$lib/components/BoardColumn.svelte';
	import MaybeDragZone from '$lib/components/MaybeDragZone.svelte';
	import { type AnyContainer, type Container, payloadTypes } from '$lib/models';
	import { mayCreateContainer } from '$lib/stores';

	export let container: AnyContainer;
	export let containers: Container[];

	setContext('mayShowRelationButton', true);

	const columns = [
		{
			title: 'internal_objective.internal_strategies',
			payloadType: payloadTypes.enum['internal_objective.internal_strategy']
		},
		{
			title: 'internal_objective.visions',
			payloadType: payloadTypes.enum['internal_objective.vision']
		},
		{
			title: 'internal_objective.strategic_goals',
			payloadType: payloadTypes.enum['internal_objective.strategic_goal']
		},
		{
			title: 'internal_objective.milestones',
			payloadType: payloadTypes.enum['internal_objective.milestone']
		},
		{
			title: 'internal_objective.tasks',
			payloadType: payloadTypes.enum['internal_objective.task']
		}
	];
</script>

<Board>
	{#each columns as column (column.title)}
		<BoardColumn
			addItemUrl={$mayCreateContainer(column.payloadType)
				? `#create=${column.payloadType}&is-part-of-measure=${container.revision}`
				: undefined}
			title={$_(column.title)}
		>
			<MaybeDragZone containers={containers.filter((c) => c.payload.type === column.payloadType)} />
		</BoardColumn>
	{/each}
</Board>
