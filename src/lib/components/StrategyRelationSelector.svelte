<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { page } from '$app/stores';
	import fetchContainers from '$lib/client/fetchContainers';
	import paramsFromURL from '$lib/client/paramsFromURL';
	import {
		isModelContainer,
		isOperationalGoalContainer,
		isStrategicGoalGoalContainer,
		payloadTypes,
		predicates
	} from '$lib/models';
	import type {
		AnyContainer,
		EmptyContainer,
		StrategyContainer,
		PartialRelation
	} from '$lib/models';

	// eslint-disable-next-line no-undef
	export let container: AnyContainer | EmptyContainer;

	let isPartOfOptionsRequest: Promise<AnyContainer[]> = new Promise(() => []);
	let isPartOfStrategyOptionsRequest: Promise<StrategyContainer[]> = new Promise(() => []);

	let allowedSuperordinateTypes = [
		payloadTypes.enum.model,
		payloadTypes.enum.strategic_goal,
		payloadTypes.enum.operational_goal
	];

	if (isStrategicGoalGoalContainer(container)) {
		allowedSuperordinateTypes = [payloadTypes.enum.model];
	} else if (isOperationalGoalContainer(container)) {
		allowedSuperordinateTypes = [payloadTypes.enum.model, payloadTypes.enum.strategic_goal];
	}

	onMount(() => {
		isPartOfStrategyOptionsRequest = fetchContainers({
			organization: [container.organization],
			...(container.organizational_unit
				? { organizationalUnit: [container.organizational_unit] }
				: undefined),
			payloadType: [payloadTypes.enum.strategy]
		}) as Promise<StrategyContainer[]>;

		const strategyRevision = container.relation.find(
			({ predicate }) => predicate === predicates.enum['is-part-of-strategy']
		)?.object;

		if (strategyRevision && !isModelContainer(container)) {
			isPartOfOptionsRequest = fetchContainers({
				isPartOfStrategy: [strategyRevision],
				payloadType: allowedSuperordinateTypes
			});
		}
	});

	if (container.relation.length == 0) {
		container.relation = paramsFromURL($page.url)
			.getAll('is-part-of')
			.map(
				(o): PartialRelation => ({
					object: Number(o),
					position: 0,
					predicate: 'is-part-of'
				})
			)
			.concat(
				paramsFromURL($page.url)
					.getAll('is-part-of-strategy')
					.map(
						(o): PartialRelation => ({
							object: Number(o),
							position: parseInt(paramsFromURL($page.url).get('position') ?? '0'),
							predicate: 'is-part-of-strategy'
						})
					)
			);

		if (isModelContainer(container)) {
			const isPartOfStrategyIndex = container.relation.findIndex(
				({ predicate, subject }) =>
					predicate === predicates.enum['is-part-of-strategy'] &&
					('revision' in container ? subject == container.revision : true)
			);

			container.relation = [
				...container.relation,
				{
					...container.relation[isPartOfStrategyIndex],
					predicate: predicates.enum['is-part-of']
				}
			];
		}
	}

	function onChangeIsPartOfStrategy(event: { currentTarget: HTMLSelectElement }) {
		const isPartOfStrategyIndex = container.relation.findIndex(
			({ predicate, subject }) =>
				predicate === predicates.enum['is-part-of-strategy'] &&
				('revision' in container ? subject == container.revision : true)
		);

		container.relation = [
			...container.relation.slice(0, isPartOfStrategyIndex),
			{
				object: parseInt(event.currentTarget.value),
				position: 0,
				predicate: predicates.enum['is-part-of-strategy'],
				...('revision' in container ? { subject: container.revision } : undefined)
			},
			...container.relation.slice(isPartOfStrategyIndex + 1)
		];

		if (container.payload.type === payloadTypes.enum.model) {
			const isPartOfIndex = container.relation.findIndex(
				({ predicate, subject }) =>
					predicate === predicates.enum['is-part-of'] &&
					('revision' in container ? subject == container.revision : true)
			);
			container.relation = [
				...container.relation.slice(0, isPartOfIndex),
				{
					object: parseInt(event.currentTarget.value),
					position: 0,
					predicate: predicates.enum['is-part-of'],
					...('revision' in container ? { subject: container.revision } : undefined)
				},
				...container.relation.slice(isPartOfIndex + 1)
			];
		} else {
			isPartOfOptionsRequest = fetchContainers({
				isPartOfStrategy: [parseInt(event.currentTarget.value)],
				payloadType: allowedSuperordinateTypes
			});
		}
	}

	function onChangeIsPartOf(event: { currentTarget: HTMLInputElement }) {
		const isPartOfIndex = container.relation.findIndex(
			({ predicate, subject }) =>
				predicate === predicates.enum['is-part-of'] &&
				('revision' in container ? subject == container.revision : true)
		);

		container.relation = [
			...container.relation.slice(0, isPartOfIndex),
			{
				object: parseInt(event.currentTarget.value),
				position: 0,
				predicate: predicates.enum['is-part-of'],
				...('revision' in container ? { subject: container.revision } : undefined)
			},
			...container.relation.slice(isPartOfIndex + 1)
		];
	}
</script>

{#await isPartOfStrategyOptionsRequest then strategyContainers}
	<label
		>{$_('strategy')}
		<select name="is-part-of-strategy" on:change={onChangeIsPartOfStrategy}>
			{#each strategyContainers as option}
				<option
					value={option.revision}
					selected={container.relation.findIndex(
						(r) =>
							r.predicate === predicates.enum['is-part-of-strategy'] && r.object === option.revision
					) > -1}
				>
					{option.payload.title}
				</option>
			{/each}
		</select>
	</label>
{/await}

{#await isPartOfOptionsRequest then isPartOfOptions}
	{#if isPartOfOptions.length > 0}
		{@const optionGroups = [
			{ heading: $_('models'), options: isPartOfOptions.filter(isModelContainer) },
			{
				heading: $_('strategic_goals'),
				options: isPartOfOptions.filter(isStrategicGoalGoalContainer)
			},
			{
				heading: $_('operational_goals'),
				options: isPartOfOptions.filter(isOperationalGoalContainer)
			}
		]}
		<fieldset>
			<legend>{$_('superordinate_element')}</legend>
			<ul class="superordinate-element-options masked-overflow">
				{#each optionGroups as group}
					{#if group.options.length > 0}
						<li>
							<p>{group.heading}</p>
							<ul>
								{#each group.options as option}
									<li>
										<label>
											<input
												type="radio"
												name="is-part-of"
												value={option.revision}
												checked={container.relation.findIndex(
													(r) =>
														r.predicate === predicates.enum['is-part-of'] &&
														r.object === option.revision
												) > -1}
												on:change={onChangeIsPartOf}
											/>
											{#if 'name' in option.payload}
												{option.payload.name}
											{:else}
												{option.payload.title}
											{/if}
										</label>
									</li>
								{/each}
							</ul>
						</li>
					{/if}
				{/each}
			</ul>
		</fieldset>
	{/if}
{/await}

<style>
	fieldset {
		padding: 0 1rem;
	}

	.superordinate-element-options {
		--mask-height: 0.5rem;

		max-height: 8.5rem;
		padding: 0.5rem 0;
	}

	.superordinate-element-options p {
		margin-bottom: 0.25rem;
	}

	.superordinate-element-options ul li {
		margin: 0.25rem 0;
	}
</style>