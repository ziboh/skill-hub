<script setup lang="ts">
/**
 * ProviderIcon — cherry-studio inspired inline SVG component
 *
 * Renders provider/brand icons as inline SVGs so hardcoded brand colors
 * (e.g. Anthropic #CA9F7B) show properly, and `currentColor` fills inherit
 * from the parent element's CSS `color` property.
 *
 * Variants (matches cherry-studio CompoundIcon convention):
 *   avatar — circular container (like cherry-studio CompoundIcon.Avatar)
 *   mono   — standalone icon, inherits text color (like cherry-studio default)
 *
 * Usage:
 *   <ProviderIcon icon="openai" />                — avatar circle (default)
 *   <ProviderIcon icon="openai" variant="mono" /> — standalone icon
 *   <ProviderIcon icon="openai" :size="32" />     — custom size
 *   <ProviderIcon icon="https://..." />           — URL image
 *   <ProviderIcon icon="data:image/..." />        — data URI
 *   <ProviderIcon icon="<svg>...</svg>" />         — inline SVG
 */

import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  icon?: string
  size?: number
  variant?: 'avatar' | 'mono'
}>(), {
  size: 20,
  variant: 'avatar',
})

/* ── SVG module registry ─────────────────────────────────────── */

const providerModules = import.meta.glob<string>('/src/assets/providers/*.svg', {
  query: '?raw', eager: true, import: 'default',
})

const platformModules = import.meta.glob<string>('/src/assets/platforms/*.svg', {
  query: '?raw', eager: true, import: 'default',
})

const ICON_ALIAS: Record<string, string> = {
  siliconcloud: 'silicon',
  chatglm: 'zhipu',
}

function resolveName(icon: string): string {
  return ICON_ALIAS[icon] || icon
}

/* ── Icon type detection ──────────────────────────────────────── */

type IconType = 'svg' | 'data-uri' | 'url' | 'local-path' | 'provider-icon'

function detectIconType(icon: string): IconType {
  if (icon.startsWith('<svg')) return 'svg'
  if (icon.startsWith('data:')) return 'data-uri'
  if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('/')) return 'url'
  return 'provider-icon'
}

/* ── Unique IDs (cherry-studio useId equivalent) ──────────────── */

let uidCounter = 0

function injectSvg(raw: string): string {
  const uid = `c${++uidCounter}`
  return raw
    .replace(/\sid="([^"]+)"/g,      ` id="${uid}-$1"`)
    .replace(/url\(#/g,               `url(#${uid}-`)
    .replace(/xlink:href="#/g,        `xlink:href="#${uid}-`)
    .replace(/\shref="#/g,            ` href="#${uid}-`)
}

/* ── Computed icon data ───────────────────────────────────────── */

const iconType = computed<IconType | null>(() => {
  if (!props.icon) return null
  return detectIconType(props.icon)
})

const iconSvg = computed(() => {
  if (!props.icon || iconType.value !== 'provider-icon') return ''
  const name = resolveName(props.icon)
  const raw = (
    providerModules[`/src/assets/providers/${name}.svg`]
    ?? platformModules[`/src/assets/platforms/${name}.svg`]
    ?? ''
  )
  return raw ? injectSvg(raw) : ''
})

const iconSrc = computed(() => {
  if (!props.icon) return ''
  const t = iconType.value
  if (t === 'svg') return props.icon
  if (t === 'data-uri' || t === 'url') return props.icon
  return ''
})

const localFileDataUri = ref('')

watch(() => props.icon, (icon) => {
  if (!icon) { localFileDataUri.value = ''; return }
  const t = detectIconType(icon)
  if (t === 'provider-icon' || t === 'svg' || t === 'data-uri' || t === 'url') {
    localFileDataUri.value = ''
    return
  }
  // local file path — read as data URI
  if (window.services?.readFileAsDataUri) {
    localFileDataUri.value = window.services.readFileAsDataUri(icon) || ''
  } else {
    localFileDataUri.value = ''
  }
}, { immediate: true })

const isSvgInline = computed(() => iconType.value === 'svg' && iconSvg.value === '')
</script>

<template>
  <!-- Avatar variant: circular themed container -->
  <span
    v-if="variant === 'avatar'"
    class="pi-avatar"
    :style="{ width: size + 'px', height: size + 'px', minWidth: size + 'px' }"
  >
    <span v-if="iconSvg" v-html="iconSvg" class="pi-avatar-icon" />
    <span v-else-if="iconType === 'svg'" v-html="icon" class="pi-avatar-icon" />
    <img v-else-if="iconType === 'url' || iconType === 'data-uri'" :src="icon" class="pi-avatar-img" />
    <img v-else-if="localFileDataUri" :src="localFileDataUri" class="pi-avatar-img" />
    <span v-else class="pi-fallback">&#x2699;</span>
  </span>

  <!-- Mono variant: standalone icon, inherits text color -->
  <span
    v-else-if="iconSvg"
    v-html="iconSvg"
    class="pi-mono"
    :style="{ width: size + 'px', height: size + 'px' }"
  />
  <span
    v-else-if="iconType === 'svg'"
    v-html="icon"
    class="pi-mono"
    :style="{ width: size + 'px', height: size + 'px' }"
  />
  <img
    v-else-if="iconType === 'url' || iconType === 'data-uri'"
    :src="icon"
    class="pi-mono-img"
    :style="{ width: size + 'px', height: size + 'px' }"
  />
  <img
    v-else-if="localFileDataUri"
    :src="localFileDataUri"
    class="pi-mono-img"
    :style="{ width: size + 'px', height: size + 'px' }"
  />
  <span v-else class="pi-fallback-mono">&#x2699;</span>
</template>

<style scoped>
.pi-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
}

.pi-avatar-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.pi-avatar-icon :deep(svg) {
  width: 100%;
  height: 100%;
  transform: scale(1.5);
}

.pi-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.pi-mono {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pi-mono :deep(svg) {
  width: 100%;
  height: 100%;
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
</style>