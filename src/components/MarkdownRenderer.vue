<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../utils/markdown'

const props = defineProps<{
  content: string
}>()

const html = computed(() => renderMarkdown(props.content))
</script>

<template>
  <div class="markdown-body" v-html="html" />
</template>

<style scoped>
.markdown-body {
  font-size: 14px;
  line-height: 1.7;
  color: hsl(var(--foreground) / 0.9);
  word-wrap: break-word;
}

.markdown-body :deep(h1) {
  font-size: 20px;
  font-weight: 700;
  margin: 20px 0 10px;
  color: hsl(var(--foreground));
  padding-bottom: 0.3em;
  border-bottom: 1px solid hsl(var(--border));
}

.markdown-body :deep(h2) {
  font-size: 17px;
  font-weight: 700;
  margin: 16px 0 8px;
  color: hsl(var(--foreground));
  padding-bottom: 0.3em;
  border-bottom: 1px solid hsl(var(--border));
}

.markdown-body :deep(h3) {
  font-size: 15px;
  font-weight: 600;
  margin: 14px 0 6px;
  color: hsl(var(--foreground));
}

.markdown-body :deep(h4) {
  font-size: 14px;
  font-weight: 600;
  margin: 12px 0 6px;
  color: hsl(var(--foreground));
}

.markdown-body :deep(p) {
  margin: 10px 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 22px;
  margin: 10px 0;
}

.markdown-body :deep(li) {
  margin: 4px 0;
}

.markdown-body :deep(li > p) {
  margin: 4px 0;
}

.markdown-body :deep(code) {
  background: hsl(var(--muted));
  padding: 2px 6px;
  border-radius: 5px;
  font-size: 13px;
  font-family: 'SF Mono', Consolas, monospace;
}

.markdown-body :deep(pre) {
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  padding: 16px;
  overflow-x: auto;
  margin: 12px 0;
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
  font-size: 13px;
  line-height: 1.6;
  border-radius: 0;
}

.markdown-body :deep(blockquote) {
  border-left: 3px solid hsl(var(--primary));
  padding-left: 16px;
  margin: 12px 0;
  color: hsl(var(--muted-foreground));
}

.markdown-body :deep(blockquote p) {
  margin: 4px 0;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid hsl(var(--border));
  margin: 16px 0;
}

.markdown-body :deep(strong) {
  font-weight: 600;
  color: hsl(var(--foreground));
}

.markdown-body :deep(em) {
  font-style: italic;
}

.markdown-body :deep(a) {
  color: hsl(var(--primary));
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 13px;
  display: block;
  overflow-x: auto;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid hsl(var(--border));
  padding: 8px 12px;
  text-align: left;
  white-space: nowrap;
}

.markdown-body :deep(th) {
  background: hsl(var(--muted));
  font-weight: 600;
}

.markdown-body :deep(tr:nth-child(even)) {
  background: hsl(var(--muted) / 0.3);
}

.markdown-body :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

.markdown-body :deep(del) {
  text-decoration: line-through;
  opacity: 0.7;
}

.markdown-body :deep(.task-list-item) {
  list-style: none;
  margin-left: -20px;
}

.markdown-body :deep(.task-list-item input) {
  margin-right: 6px;
}
</style>
