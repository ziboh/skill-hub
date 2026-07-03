<script setup lang="ts">
/**
 * ProviderIcon — unified icon component
 *
 * Renders provider/platform/brand icons supporting all formats:
 *   - SVG files (providers/*.svg, platforms/*.svg) as inline SVG
 *   - PNG files (platforms/*.png) as img
 *   - Inline SVG strings (<svg>...</svg>)
 *   - Data URIs (data:image/...)
 *   - URLs (http://..., https://...)
 *   - Local file paths (read as data URI)
 *
 * Variants:
 *   avatar — circular themed container (default)
 *   mono   — standalone icon, inherits text color
 *
 * Usage:
 *   <ProviderIcon icon="openai" />                — avatar circle
 *   <ProviderIcon icon="cline" variant="mono" />  — standalone icon
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

/* ── Icon module registry (lazy) ─────────────────────────────── */

const providerModules = import.meta.glob<string>('/src/assets/providers/*.svg', {
  query: '?raw', import: 'default',
})

const platformSvgModules = import.meta.glob<string>('/src/assets/platforms/*.svg', {
  query: '?raw', import: 'default',
})

const platformPngModules = import.meta.glob<string>('/src/assets/platforms/*.png', {
  import: 'default',
})

const iconCache = new Map<string, string>()

async function loadIconModule(path: string, loader?: () => Promise<any>): Promise<string> {
  if (iconCache.has(path)) return iconCache.get(path)!
  if (!loader) return ''
  const mod = await loader()
  const value = (mod as any).default ?? mod
  iconCache.set(path, value as string)
  return value as string
}

const ICON_ALIAS: Record<string, string> = {
  siliconcloud: 'silicon',
  chatglm: 'zhipu',
  kilo: 'kilo-light',
  codebuddy: 'codebuddy-light',
  'trae-cn': 'trae',
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

/* ── Reactive icon data (lazy loaded) ─────────────────────────── */

const iconSvg = ref('')
const iconPng = ref('')
const iconPlatformSvg = ref('')

async function loadIconData(icon: string) {
  const t = detectIconType(icon)
  if (t !== 'provider-icon') {
    iconSvg.value = ''
    iconPng.value = ''
    iconPlatformSvg.value = ''
    return
  }
  const name = resolveName(icon)

  const [svg, png, platformSvg] = await Promise.all([
    loadIconModule(
      `/src/assets/providers/${name}.svg`,
      providerModules[`/src/assets/providers/${name}.svg`],
    ),
    loadIconModule(
      `/src/assets/platforms/${name}.png`,
      platformPngModules[`/src/assets/platforms/${name}.png`],
    ),
    loadIconModule(
      `/src/assets/platforms/${name}.svg`,
      platformSvgModules[`/src/assets/platforms/${name}.svg`],
    ),
  ])

  iconSvg.value = svg ? injectSvg(svg) : ''
  iconPng.value = png
  iconPlatformSvg.value = platformSvg ? injectSvg(platformSvg) : ''
}

/* ── Computed icon data ───────────────────────────────────────── */

const iconType = computed<IconType | null>(() => {
  if (!props.icon) return null
  return detectIconType(props.icon)
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
  if (!icon) {
    iconSvg.value = ''
    iconPng.value = ''
    iconPlatformSvg.value = ''
    localFileDataUri.value = ''
    return
  }
  const t = detectIconType(icon)
  if (t === 'provider-icon') {
    loadIconData(icon)
    localFileDataUri.value = ''
    return
  }
  iconSvg.value = ''
  iconPng.value = ''
  iconPlatformSvg.value = ''
  if (t === 'svg' || t === 'data-uri' || t === 'url') {
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
    <img v-else-if="iconPng" :src="iconPng" class="pi-avatar-img" />
    <span v-else-if="iconPlatformSvg" v-html="iconPlatformSvg" class="pi-avatar-icon" />
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
    v-else-if="iconPng"
    :src="iconPng"
    class="pi-mono-img"
    :style="{ width: size + 'px', height: size + 'px' }"
  />
  <span
    v-else-if="iconPlatformSvg"
    v-html="iconPlatformSvg"
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

/* Dark mode: make dark fills/strokes visible without affecting brand colors */
[data-theme="dark"] .pi-avatar-icon :deep(svg [fill="black"]) {
  fill: hsl(var(--foreground));
}
[data-theme="dark"] .pi-avatar-icon :deep(svg [fill="#1A1A1A"]),
[data-theme="dark"] .pi-avatar-icon :deep(svg [fill="#222222"]),
[data-theme="dark"] .pi-avatar-icon :deep(svg [fill="#24292F"]) {
  fill: hsl(var(--foreground));
}
[data-theme="dark"] .pi-avatar-icon :deep(svg [stroke="#1A1A1A"]),
[data-theme="dark"] .pi-avatar-icon :deep(svg [stroke="#222222"]),
[data-theme="dark"] .pi-avatar-icon :deep(svg [stroke="#24292F"]) {
  stroke: hsl(var(--foreground));
}
/* Cline icon: dark stroke needs light foreground in dark mode */
[data-theme="dark"] .pi-mono :deep(svg [stroke="#24292F"]) {
  stroke: hsl(var(--foreground));
}
</style>