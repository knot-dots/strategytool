<script lang="ts">
	import Info from '~icons/knotdots/info';
	import Effects from '~icons/knotdots/effects';
	import Resources from '~icons/knotdots/resources';
	import { _ } from 'svelte-i18n';
	import { isContainerWithEffect } from '$lib/models';
	import type { AnyContainer, ContainerDetailViewTabKey } from '$lib/models';
	import { applicationState } from '$lib/stores';

	export let container: AnyContainer;

	$: showEffectsTab = isContainerWithEffect(container) && container.payload.effect.length > 0;

	function updateApplicationState(activeTab: ContainerDetailViewTabKey) {
		applicationState.update((state) => ({
			...state,
			containerDetailView: { ...state.containerDetailView, activeTab }
		}));
	}
</script>

{#if $applicationState.containerDetailView.tabs.includes('basic-data')}
	<li>
		<button
			title={$_('form.basic_data')}
			type="button"
			class="button-nav button-square"
			class:is-active={$applicationState.containerDetailView.activeTab === 'basic-data'}
			on:click={() => updateApplicationState('basic-data')}
		>
			<Info />
		</button>
	</li>
{/if}
{#if $applicationState.containerDetailView.tabs.includes('resources')}
	<li>
		<button
			title={$_('form.resources')}
			type="button"
			class="button-nav button-square"
			class:is-active={$applicationState.containerDetailView.activeTab === 'resources'}
			on:click={() => updateApplicationState('resources')}
		>
			<Resources />
		</button>
	</li>
{/if}
{#if $applicationState.containerDetailView.tabs.includes('effects') && showEffectsTab}
	<li>
		<button
			title={$_('form.effects')}
			type="button"
			class="button-nav button-square"
			class:is-active={$applicationState.containerDetailView.activeTab === 'effects'}
			on:click={() => updateApplicationState('effects')}
		>
			<Effects />
		</button>
	</li>
{/if}
