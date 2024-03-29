<script lang="ts">
	import { _ } from 'svelte-i18n';
	import PlusSmall from '~icons/heroicons/plus-small-solid';
	import { page } from '$app/stores';
	import Editor from '$lib/components/Editor.svelte';
	import ListBox from '$lib/components/ListBox.svelte';
	import {
		audience,
		quantities,
		sustainableDevelopmentGoals,
		topics,
		unitByQuantity,
		units
	} from '$lib/models';
	import type {
		ContainerFormTabKey,
		EmptyIndicatorContainer,
		IndicatorContainer,
		IndicatorTemplateContainer,
		Quantity
	} from '$lib/models';
	import { applicationState } from '$lib/stores';

	export let container: IndicatorContainer | EmptyIndicatorContainer;

	applicationState.update((state) => ({
		...state,
		containerForm: {
			activeTab: 'guid' in container ? 'basic-data' : 'metadata',
			tabs: [
				...('guid' in container ? [] : ['metadata' as ContainerFormTabKey]),
				'basic-data',
				'historical-values'
			]
		}
	}));

	$: if (container.payload.historicalValues.length === 0) {
		const thisYear = new Date().getFullYear();
		container.payload.historicalValues = [...Array(10)].map((_, index) => [
			thisYear + index - 5,
			0
		]);
	}

	function changeQuantity(event: { currentTarget: HTMLSelectElement }) {
		container.payload.quantity = event.currentTarget.value;

		if (container.payload.quantity == quantities.enum['quantity.custom']) {
			container.payload.title = '';
		} else if (quantities.options.includes(container.payload.quantity as Quantity)) {
			container.payload.title = $_(`${container.payload.quantity}.label`);
			container.payload.unit = unitByQuantity.get(container.payload.quantity as Quantity);
		} else {
			const indicatorTemplate = $page.data.indicatorTemplates.find(
				({ guid }: IndicatorTemplateContainer) => guid === container.payload.quantity
			);

			if (indicatorTemplate) {
				container.payload.title = indicatorTemplate.payload.title;
				container.payload.unit = indicatorTemplate.payload.unit;
				container.payload.description = indicatorTemplate.payload.description;
				container.payload.historicalValuesIntro = indicatorTemplate.payload.historicalValuesIntro;
				container.payload.measuresIntro = indicatorTemplate.payload.measuresIntro;
				container.payload.objectivesIntro = indicatorTemplate.payload.objectivesIntro;
			}
		}
	}

	function updateHistoricalValues(index: number) {
		return (event: { currentTarget: HTMLInputElement }) => {
			if (
				container.payload.historicalValues
					.slice(index)
					.every(([, value]) => value == container.payload.historicalValues[index][1])
			) {
				for (let i = index; i < container.payload.historicalValues.length; i++) {
					container.payload.historicalValues[i][1] = parseFloat(event.currentTarget.value);
				}
			} else {
				container.payload.historicalValues[index][1] = parseFloat(event.currentTarget.value);
			}
		};
	}

	function prependHistoricalValue() {
		const year = container.payload.historicalValues[0][0] - 1;
		container.payload.historicalValues = [[year, 0], ...container.payload.historicalValues];
	}

	function appendHistoricalValue() {
		const year =
			container.payload.historicalValues[container.payload.historicalValues.length - 1][0] + 1;
		container.payload.historicalValues = [...container.payload.historicalValues, [year, 0]];
	}
</script>

{#if $applicationState.containerForm.activeTab === 'metadata'}
	<fieldset class="form-tab" id="metadata">
		<legend>{$_('form.metadata')}</legend>

		<label>
			{$_('indicator.template')}
			<select on:change={changeQuantity} required>
				<option></option>
				<option value={'quantity.custom'}>{$_('quantity.custom.label')}</option>
				{#each $page.data.indicatorTemplates as { guid, payload }}
					<option value={guid}>{payload.title}</option>
				{/each}
			</select>
		</label>

		{#if container.payload.quantity}
			<label>
				{$_('label.unit')}
				<select
					name="unit"
					bind:value={container.payload.unit}
					disabled={container.payload.quantity !== quantities.enum['quantity.custom']}
				>
					{#each units.options as unitOption}
						<option value={unitOption}>{$_(unitOption)}</option>
					{/each}
				</select>
			</label>
		{/if}

		<ListBox
			label={$_('audience')}
			options={audience.options}
			bind:value={container.payload.audience}
		/>
	</fieldset>
{:else if $applicationState.containerForm.activeTab === 'basic-data'}
	<fieldset class="form-tab" id="basic-data">
		{#key 'guid' in container ? container.guid : ''}
			<Editor label={$_('description')} bind:value={container.payload.description} />

			<Editor
				label={$_('indicator.historical_values_intro')}
				bind:value={container.payload.historicalValuesIntro}
			/>

			<Editor
				label={$_('indicator.objectives_intro')}
				bind:value={container.payload.objectivesIntro}
			/>

			<Editor label={$_('indicator.measures_intro')} bind:value={container.payload.measuresIntro} />
		{/key}

		<ListBox
			label={$_('topic.label')}
			options={topics.options}
			bind:value={container.payload.topic}
		/>

		<ListBox
			label={$_('category')}
			options={sustainableDevelopmentGoals.options}
			bind:value={container.payload.category}
		/>
	</fieldset>
{:else if $applicationState.containerForm.activeTab === 'historical-values'}
	<fieldset class="form-tab" id="historical-values">
		<legend>{$_('form.historical_values')}</legend>

		<table class="spreadsheet">
			<thead>
				<tr>
					<th scope="col"></th>
					<th scope="col">
						{$_(container.payload.unit ?? '')}
					</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td colspan="2">
						<button
							class="quiet"
							title={$_('add_value')}
							type="button"
							on:click={prependHistoricalValue}
						>
							<PlusSmall />
						</button>
					</td>
				</tr>
				{#each container.payload.historicalValues.map((v, i) => i) as index}
					<tr>
						<th scope="row">
							{container.payload.historicalValues[index][0]}
						</th>
						<td>
							<input
								type="text"
								inputmode="decimal"
								value={container.payload.historicalValues[index][1]}
								on:change={updateHistoricalValues(index)}
							/>
						</td>
					</tr>
				{/each}
				<tr>
					<td colspan="2">
						<button
							class="quiet"
							title={$_('add_value')}
							type="button"
							on:click={appendHistoricalValue}
						>
							<PlusSmall />
						</button>
					</td>
				</tr>
			</tbody>
		</table>
	</fieldset>
{/if}
