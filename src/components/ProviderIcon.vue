<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { IconValue } from '../icons'
import type { UiIconName } from './UiIcon.vue'

withDefaults(
  defineProps<{
    icon?: string | IconValue
    size?: number
    variant?: 'avatar' | 'mono'
    fallback?: UiIconName
  }>(),
  {
    size: 20,
    variant: 'avatar',
    fallback: 'settings',
  },
)
</script>

<template>
  <AppIcon :icon="icon" :size="size" :variant="variant" :fallback="fallback" />
</template>
