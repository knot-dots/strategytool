import type { SvelteComponent } from 'svelte';
import type { SVGAttributes } from 'svelte/elements';
import Bars2 from '~icons/heroicons/bars-2-solid';
import CheckCircle from '~icons/heroicons/check-circle-16-solid';
import Cog8Tooth from '~icons/heroicons/cog-8-tooth-16-solid';
import Flag from '~icons/heroicons/flag-16-solid';
import LightBulb from '~icons/heroicons/light-bulb-16-solid';
import Minus from '~icons/heroicons/minus-solid';
import Pencil from '~icons/heroicons/pencil-16-solid';
import Plus from '~icons/heroicons/plus-solid';
import Square2Stack from '~icons/heroicons/square-2-stack';
import sdg01 from '$lib/assets/sdg/sdg-01.svg';
import sdg02 from '$lib/assets/sdg/sdg-02.svg';
import sdg03 from '$lib/assets/sdg/sdg-03.svg';
import sdg04 from '$lib/assets/sdg/sdg-04.svg';
import sdg05 from '$lib/assets/sdg/sdg-05.svg';
import sdg06 from '$lib/assets/sdg/sdg-06.svg';
import sdg07 from '$lib/assets/sdg/sdg-07.svg';
import sdg08 from '$lib/assets/sdg/sdg-08.svg';
import sdg09 from '$lib/assets/sdg/sdg-09.svg';
import sdg10 from '$lib/assets/sdg/sdg-10.svg';
import sdg11 from '$lib/assets/sdg/sdg-11.svg';
import sdg12 from '$lib/assets/sdg/sdg-12.svg';
import sdg13 from '$lib/assets/sdg/sdg-13.svg';
import sdg14 from '$lib/assets/sdg/sdg-14.svg';
import sdg15 from '$lib/assets/sdg/sdg-15.svg';
import sdg16 from '$lib/assets/sdg/sdg-16.svg';
import sdg17 from '$lib/assets/sdg/sdg-17.svg';
import { predicates, status, sustainableDevelopmentGoals, taskStatus } from '$lib/models';
import type { Status, SustainableDevelopmentGoal, TaskStatus } from '$lib/models';

export const predicateIcons = new Map<string, typeof SvelteComponent<SVGAttributes<SVGSVGElement>>>(
	[
		[predicates.enum['is-consistent-with'], Plus],
		[predicates.enum['is-duplicate-of'], Square2Stack],
		[predicates.enum['is-equivalent-to'], Bars2],
		[predicates.enum['is-inconsistent-with'], Minus]
	]
);

export const sdgIcons = new Map<SustainableDevelopmentGoal, string>([
	[sustainableDevelopmentGoals.enum['sdg.01'], sdg01],
	[sustainableDevelopmentGoals.enum['sdg.02'], sdg02],
	[sustainableDevelopmentGoals.enum['sdg.03'], sdg03],
	[sustainableDevelopmentGoals.enum['sdg.04'], sdg04],
	[sustainableDevelopmentGoals.enum['sdg.05'], sdg05],
	[sustainableDevelopmentGoals.enum['sdg.06'], sdg06],
	[sustainableDevelopmentGoals.enum['sdg.07'], sdg07],
	[sustainableDevelopmentGoals.enum['sdg.08'], sdg08],
	[sustainableDevelopmentGoals.enum['sdg.09'], sdg09],
	[sustainableDevelopmentGoals.enum['sdg.10'], sdg10],
	[sustainableDevelopmentGoals.enum['sdg.11'], sdg11],
	[sustainableDevelopmentGoals.enum['sdg.12'], sdg12],
	[sustainableDevelopmentGoals.enum['sdg.13'], sdg13],
	[sustainableDevelopmentGoals.enum['sdg.14'], sdg14],
	[sustainableDevelopmentGoals.enum['sdg.15'], sdg15],
	[sustainableDevelopmentGoals.enum['sdg.16'], sdg16],
	[sustainableDevelopmentGoals.enum['sdg.17'], sdg17]
]);

export const statusColors = new Map<Status, string>([
	[status.enum['status.idea'], 'red'],
	[status.enum['status.in_planning'], 'orange'],
	[status.enum['status.in_implementation'], 'yellow'],
	[status.enum['status.in_operation'], 'green'],
	[status.enum['status.done'], 'green']
]);

export const statusBackgrounds = new Map<Status, string>([
	[status.enum['status.idea'], 'var(--gradient-idea)'],
	[status.enum['status.in_planning'], 'var(--gradient-in-planning)'],
	[status.enum['status.in_implementation'], 'var(--gradient-in-implementation)'],
	[status.enum['status.in_operation'], 'var(--gradient-in-operation)'],
	[status.enum['status.done'], 'var(--gradient-done)']
]);

export const statusHoverColors = new Map<Status, string>([
	[status.enum['status.idea'], 'var(--color-hover-idea)'],
	[status.enum['status.in_planning'], 'var(--color-hover-in-planning)'],
	[status.enum['status.in_implementation'], 'var(--color-hover-in-implementation)'],
	[status.enum['status.in_operation'], 'var(--color-hover-in-operation)'],
	[status.enum['status.done'], 'var(--color-hover-done)']
]);

export const statusIcons = new Map<Status, typeof SvelteComponent<SVGAttributes<SVGSVGElement>>>([
	[status.enum['status.idea'], LightBulb],
	[status.enum['status.in_planning'], Pencil],
	[status.enum['status.in_implementation'], Cog8Tooth],
	[status.enum['status.in_operation'], Flag],
	[status.enum['status.done'], CheckCircle]
]);

export const taskStatusColors = new Map<TaskStatus, string>([
	[taskStatus.enum['task_status.idea'], 'red'],
	[taskStatus.enum['task_status.in_planning'], 'orange'],
	[taskStatus.enum['task_status.in_progress'], 'yellow'],
	[taskStatus.enum['task_status.done'], 'green']
]);

export const taskStatusBackgrounds = new Map<TaskStatus, string>([
	[taskStatus.enum['task_status.idea'], 'var(--gradient-idea)'],
	[taskStatus.enum['task_status.in_planning'], 'var(--gradient-in-planning)'],
	[taskStatus.enum['task_status.in_progress'], 'var(--gradient-in-implementation)'],
	[taskStatus.enum['task_status.done'], 'var(--gradient-done)']
]);

export const taskStatusHoverColors = new Map<TaskStatus, string>([
	[taskStatus.enum['task_status.idea'], 'var(--color-hover-idea)'],
	[taskStatus.enum['task_status.in_planning'], 'var(--color-hover-in-planning)'],
	[taskStatus.enum['task_status.in_progress'], 'var(--color-hover-in-implementation)'],
	[taskStatus.enum['task_status.done'], 'var(--color-hover-done)']
]);

export const taskStatusIcons = new Map<
	TaskStatus,
	typeof SvelteComponent<SVGAttributes<SVGSVGElement>>
>([
	[taskStatus.enum['task_status.idea'], LightBulb],
	[taskStatus.enum['task_status.in_planning'], Pencil],
	[taskStatus.enum['task_status.in_progress'], Cog8Tooth],
	[taskStatus.enum['task_status.done'], Flag]
]);
