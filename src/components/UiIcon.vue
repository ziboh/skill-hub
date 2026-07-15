<script setup lang="ts">
import { computed } from 'vue'

export type UiIconName =
  | 'settings'
  | 'palette'
  | 'cpu'
  | 'globe'
  | 'bot'
  | 'database'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'file'
  | 'file-text'
  | 'folder'
  | 'folder-open'
  | 'link'
  | 'package'
  | 'clipboard'
  | 'search'
  | 'sparkles'
  | 'wrench'
  | 'pencil'
  | 'rocket'
  | 'lock'
  | 'alert-triangle'
  | 'arrow-left'

const props = withDefaults(
  defineProps<{
    name: UiIconName
    size?: number
    strokeWidth?: number
  }>(),
  {
    size: 16,
    strokeWidth: 1.8,
  },
)

const iconPaths: Record<UiIconName, string[]> = {
  settings: [
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    'M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.9 1.9-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20h-2.68v-.09a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-1.9-1.9.06-.06A1.7 1.7 0 0 0 7.78 15a1.7 1.7 0 0 0-1.56-1.03H6v-2.68h.22A1.7 1.7 0 0 0 7.78 10a1.7 1.7 0 0 0-.34-1.88l-.06-.06 1.9-1.9.06.06A1.7 1.7 0 0 0 11.22 6a1.7 1.7 0 0 0 1.03-1.56V4h2.68v.44A1.7 1.7 0 0 0 15.96 6a1.7 1.7 0 0 0 1.88.34l.06-.06 1.9 1.9-.06.06A1.7 1.7 0 0 0 19.4 10a1.7 1.7 0 0 0 1.56 1.03H21v2.68h-.04A1.7 1.7 0 0 0 19.4 15Z',
  ],
  palette: [
    'M12 3a9 9 0 0 0 0 18h1.5a1.5 1.5 0 0 0 0-3H12a1.5 1.5 0 0 1 0-3h2a7 7 0 0 0 0-12H12Z',
    'M7.5 9.5h.01',
    'M10 6.5h.01',
    'M15.5 7.5h.01',
    'M18 11h.01',
  ],
  cpu: [
    'M9 9h6v6H9z',
    'M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3',
    'M7 6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
  ],
  globe: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M3 12h18', 'M12 3a14 14 0 0 1 0 18', 'M12 3a14 14 0 0 0 0 18'],
  bot: ['M12 8V4H8', 'M4 8h16v10H4z', 'M8 13h.01M16 13h.01', 'M8 18v2M16 18v2M2 12h2M20 12h2'],
  database: [
    'M4 5c0-1.1 3.6-2 8-2s8 .9 8 2-3.6 2-8 2-8-.9-8-2Z',
    'M4 5v7c0 1.1 3.6 2 8 2s8-.9 8-2V5',
    'M4 12v7c0 1.1 3.6 2 8 2s8-.9 8-2v-7',
  ],
  sun: ['M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41'],
  moon: ['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z'],
  monitor: ['M4 5h16v11H4z', 'M8 21h8M12 16v5'],
  file: ['M6 3h8l4 4v14H6z', 'M14 3v5h5', 'M9 13h6M9 17h4'],
  'file-text': ['M6 3h8l4 4v14H6z', 'M14 3v5h5', 'M9 13h6M9 17h6'],
  folder: ['M3 5h6l2 2h10v12H3z'],
  'folder-open': ['M3 5h6l2 2h10l-2 12H3z', 'M3 10h18'],
  link: ['M10 13a5 5 0 0 0 7.07.07l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15', 'M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15'],
  package: ['M3 7l9 5 9-5', 'M12 12v9', 'M20 7v10l-8 4-8-4V7l8-4 8 4Z', 'M8 5l8 4'],
  clipboard: ['M9 5h6', 'M9 3h6v4H9z', 'M6 5H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-1', 'M8 12h8M8 16h5'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'm21 21-4.35-4.35'],
  sparkles: ['m12 3-1.1 3.9L7 8l3.9 1.1L12 13l1.1-3.9L17 8l-3.9-1.1L12 3Z', 'm19 14-.7 2.3L16 17l2.3.7L19 20l.7-2.3L22 17l-2.3-.7L19 14Z', 'm5 14-.6 1.9L2.5 16.5l1.9.6L5 19l.6-1.9 1.9-.6-1.9-.6L5 14Z'],
  wrench: ['M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4L15 11l-2-2 1.7-2.7Z'],
  pencil: ['M4 20h4L19 9l-4-4L4 16v4Z', 'm13.5 6.5 4 4'],
  rocket: ['M4.5 16.5c-1.5 1.26-2 3.5-2 3.5s2.24-.5 3.5-2c.71-.84.7-2.13-.1-2.93a2.1 2.1 0 0 0-1.4-.57Z', 'M12 15l-3-3a22 22 0 0 1 2-3.5C13.5 5 17 3 21 3c0 4-2 7.5-5.5 10a22 22 0 0 1-3.5 2Z', 'M9 12H4l3-3', 'M12 15v5l3-3'],
  lock: ['M6 11h12v9H6z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  'alert-triangle': ['m12 3 10 18H2L12 3Z', 'M12 9v4', 'M12 17h.01'],
  'arrow-left': ['M19 12H5', 'm12 19-7-7 7-7'],
}

const paths = computed(() => iconPaths[props.name])
</script>

<template>
  <svg
    class="ui-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="path in paths" :key="path" :d="path" />
  </svg>
</template>

<style scoped>
.ui-icon {
  display: block;
  flex-shrink: 0;
}
</style>
