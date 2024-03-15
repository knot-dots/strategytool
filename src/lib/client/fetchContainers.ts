import { z } from 'zod';
import { anyContainer } from '$lib/models';
import type { PayloadType } from '$lib/models';

export default async function fetchContainers(
	filters: {
		assignee?: string[];
		audience?: string[];
		category?: string[];
		implements?: number[];
		isPartOfMeasure?: number[];
		isPartOfStrategy?: number[];
		organization?: string[];
		organizationalUnit?: string[];
		payloadType?: PayloadType[];
		strategyType?: string[];
		taskCategory?: string[];
		terms?: string;
		topic?: string[];
	},
	sort?: string
) {
	const params = new URLSearchParams();
	for (const value of filters.assignee ?? []) {
		params.append('assignee', value);
	}
	for (const value of filters.audience ?? []) {
		params.append('audience', value);
	}
	for (const value of filters.category ?? []) {
		params.append('category', value);
	}
	for (const value of filters.implements ?? []) {
		params.append('implements', String(value));
	}
	for (const value of filters.isPartOfMeasure ?? []) {
		params.append('isPartOfMeasure', String(value));
	}
	for (const value of filters.isPartOfStrategy ?? []) {
		params.append('isPartOfStrategy', String(value));
	}
	for (const value of filters.organization ?? []) {
		params.append('organization', value);
	}
	for (const value of filters.organizationalUnit ?? []) {
		params.append('organizationalUnit', value);
	}
	for (const value of filters.payloadType ?? []) {
		params.append('payloadType', value);
	}
	if (sort) {
		params.append('sort', sort);
	}
	for (const value of filters.strategyType ?? []) {
		params.append('strategyType', value);
	}
	for (const value of filters.taskCategory ?? []) {
		params.append('taskCategory', value);
	}
	if (filters.terms) {
		params.append('terms', filters.terms);
	}
	for (const value of filters.topic ?? []) {
		params.append('topic', value);
	}
	const response = await fetch(`/container?${params}`);
	const data = await response.json();
	return z.array(anyContainer).parse(data);
}
