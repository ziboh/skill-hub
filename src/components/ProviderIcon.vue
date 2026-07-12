<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { IconValue } from '../icons'

withDefaults(
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
</script>

<template>
  <AppIcon :icon="icon" :size="size" :variant="variant" :fallback="fallback" />
</template>
