<script lang="ts">
	import PuzzlePiece from '~icons/heroicons/puzzle-piece-20-solid';
	import TableCells from '~icons/heroicons/table-cells-20-solid';
	import Effects from '~icons/knotdots/effects';
	import Info from '~icons/knotdots/info';
	import Resources from '~icons/knotdots/resources';
	import { _ } from 'svelte-i18n';
	import { boards, isContainerWithEffect } from '$lib/models';
	import type { AnyContainer, ContainerFormTabKey } from '$lib/models';
	import { applicationState, getOrganization, getOrganizationalUnit } from '$lib/stores';

	export let container: AnyContainer;

	let showEffectsTab: boolean;

	$: {
		const organizationOrOrganizationalUnit = container.organizational_unit
			? $getOrganizationalUnit(container.organizational_unit)
			: $getOrganization(container.organization);

		showEffectsTab =
			isContainerWithEffect(container) &&
			organizationOrOrganizationalUnit?.payload.boards.includes(boards.enum['board.indicators']);
	}

	function updateApplicationState(activeTab: ContainerFormTabKey) {
		applicationState.update((state) => ({
			...state,
			containerForm: { ...state.containerForm, activeTab }
		}));
	}
</script>

{#if $applicationState.containerForm.tabs.includes('metadata')}
	<li>
		<button
			title={$_('form.metadata')}
			type="button"
			class="button-nav button-square"
			class:is-active={$applicationState.containerForm.activeTab === 'metadata'}
			on:click={() => updateApplicationState('metadata')}
		>
			<PuzzlePiece />
		</button>
	</li>
{/if}
{#if $applicationState.containerForm.tabs.includes('basic-data')}
	<li>
		<button
			title={$_('form.basic_data')}
			type="button"
			class="button-nav button-square"
			class:is-active={$applicationState.containerForm.activeTab === 'basic-data'}
			on:click={() => updateApplicationState('basic-data')}
		>
			<Info />
		</button>
	</li>
{/if}
{#if $applicationState.containerForm.tabs.includes('resources')}
	<li>
		<button
			title={$_('form.resources')}
			type="button"
			class="button-nav button-square"
			class:is-active={$applicationState.containerForm.activeTab === 'resources'}
			on:click={() => updateApplicationState('resources')}
		>
			<Resources />
		</button>
	</li>
{/if}
{#if $applicationState.containerForm.tabs.includes('effects') && showEffectsTab}
	<li>
		<button
			title={$_('form.effects')}
			type="button"
			class="button-nav button-square"
			class:is-active={$applicationState.containerForm.activeTab === 'effects'}
			on:click={() => updateApplicationState('effects')}
		>
			<Effects />
		</button>
	</li>
{/if}
{#if $applicationState.containerForm.tabs.includes('historical-values')}
	<li>
		<button
			title={$_('form.historical_values')}
			type="button"
			class="button-nav button-square"
			class:is-active={$applicationState.containerForm.activeTab === 'historical-values'}
			on:click={() => updateApplicationState('historical-values')}
		>
			<TableCells />
		</button>
	</li>
{/if}
