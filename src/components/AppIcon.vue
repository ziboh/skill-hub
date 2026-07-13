<script setup lang="ts">
import { ref, watch } from 'vue'
import { parseIcon, resolveIcon, type IconValue, type ResolvedIcon } from '../icons'

const props = withDefaults(
  defineProps<{
    icon?: string | IconValue
    size?: number
    variant?: 'avatar' | 'mono'
    fallback?: string
  }>(),
  {
    size: 20,
    variant: 'avatar',
    fallback: '⚙',
  },
)

const resolved = ref<ResolvedIcon>({ mode: 'empty' })
const isStoreIcon = ref(false)
let seq = 0

watch(
  () => props.icon,
  async (icon) => {
    const my = ++seq
    const value =
      icon && typeof icon === 'object' && 'kind' in icon
        ? (icon as IconValue)
        : parseIcon(icon as string | undefined)
    isStoreIcon.value = typeof icon === 'string' && (icon?.startsWith('store:') || false)
    const next = await resolveIcon(value)
    if (my === seq) resolved.value = next
  },
  { immediate: true },
)
</script>

<template>
  <span
    v-if="variant === 'avatar'"
    class="pi-avatar"
    :style="{ width: size + 'px', height: size + 'px', minWidth: size + 'px' }"
  >
    <span v-if="resolved.mode === 'svg'" v-html="resolved.svg" :class="['pi-avatar-icon', { 'pi-store-icon': isStoreIcon }]" />
    <img v-else-if="resolved.mode === 'img'" :src="resolved.src" class="pi-avatar-img" />
    <span v-else class="pi-fallback">{{ fallback }}</span>
  </span>
  <span
    v-else-if="resolved.mode === 'svg'"
    v-html="resolved.svg"
    class="pi-mono"
    :style="{ width: size + 'px', height: size + 'px' }"
  />
  <img
    v-else-if="resolved.mode === 'img'"
    :src="resolved.src"
    class="pi-mono-img"
    :style="{ width: size + 'px', height: size + 'px' }"
  />
  <span v-else class="pi-fallback-mono">{{ fallback }}</span>
</template>

<style scoped>
.pi-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: hsl(var(--muted));
}

.pi-avatar-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.pi-avatar-icon :deep(svg) {
  width: 100% !important;
  height: 100% !important;
  transform: scale(1.5);
  flex-shrink: 0;
}

.pi-avatar-icon.pi-store-icon :deep(svg) {
  transform: none;
}

.pi-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  flex-shrink: 0;
}

.pi-mono {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: hsl(var(--foreground));
}

.pi-mono :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

.pi-mono-img {
  object-fit: contain;
  flex-shrink: 0;
}

.pi-fallback {
  font-size: inherit;
  line-height: 1;
}

.pi-fallback-mono {
  font-size: 16px;
  line-height: 1;
  flex-shrink: 0;
}

/* Dark mode: make dark fills/strokes visible without affecting brand colors */
[data-theme='dark'] .pi-avatar-icon :deep(svg [fill='black']) {
  fill: hsl(var(--foreground));
}
[data-theme='dark'] .pi-avatar-icon :deep(svg [fill='#1A1A1A']),
[data-theme='dark'] .pi-avatar-icon :deep(svg [fill='#222222']),
[data-theme='dark'] .pi-avatar-icon :deep(svg [fill='#24292F']) {
  fill: hsl(var(--foreground));
}
[data-theme='dark'] .pi-avatar-icon :deep(svg [stroke='#1A1A1A']),
[data-theme='dark'] .pi-avatar-icon :deep(svg [stroke='#222222']),
[data-theme='dark'] .pi-avatar-icon :deep(svg [stroke='#24292F']) {
  stroke: hsl(var(--foreground));
}
/* Mono variant: dark fills/strokes need light foreground in dark mode */
[data-theme='dark'] .pi-mono :deep(svg [fill='#1A1A1A']),
[data-theme='dark'] .pi-mono :deep(svg [fill='#222222']),
[data-theme='dark'] .pi-mono :deep(svg [fill='#24292F']) {
  fill: hsl(var(--foreground));
}
[data-theme='dark'] .pi-mono :deep(svg [stroke='#1A1A1A']),
[data-theme='dark'] .pi-mono :deep(svg [stroke='#222222']),
[data-theme='dark'] .pi-mono :deep(svg [stroke='#24292F']) {
  stroke: hsl(var(--foreground));
}

/* generic.svg uses fill="#1296db" — keep visible in mono */
.pi-mono :deep(svg),
.pi-avatar-icon :deep(svg) {
  max-width: 100%;
  max-height: 100%;
  overflow: visible;
}
</style>
