<script lang="ts">
	import { unified } from 'unified';
	import remarkParse from 'remark-parse';
	import remarkGfm from 'remark-gfm';
	import remarkRehype from 'remark-rehype';
	import rehypeSanitize from 'rehype-sanitize';
	import rehypeStringify from 'rehype-stringify';
	import stripMarkdown from 'strip-markdown';
	import rehypeExtractExcerpt from 'rehype-extract-excerpt';
	import type { Container, EmptyContainer } from '$lib/models';

	export let container: Container | EmptyContainer;
</script>

{#if 'summary' in container.payload && container.payload.summary}
	<p>{container.payload.summary}</p>
{:else if 'description' in container.payload && container.payload.description}
	{#await unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(stripMarkdown)
		.use(remarkRehype)
		.use(rehypeSanitize)
		.use(rehypeExtractExcerpt, { maxLength: 200 })
		.use(rehypeStringify)
		.process(container.payload.description) then content}
		{#if content.data.excerpt}
			<p>{@html content.data.excerpt}</p>
		{/if}
	{/await}
{/if}
