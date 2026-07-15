<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    enabled: boolean
    busy?: boolean
  }>(),
  { busy: false },
)

const emit = defineEmits<{ (e: 'toggle'): void }>()
</script>

<template>
  <button
    type="button"
    class="skill-enabled-toggle"
    :class="{ enabled: props.enabled, busy: props.busy }"
    :aria-pressed="props.enabled"
    :aria-label="props.enabled ? '停用 Skill' : '启用 Skill'"
    :title="props.busy ? '正在切换…' : props.enabled ? '停用 Skill' : '启用 Skill'"
    :disabled="props.busy"
    @click.stop="emit('toggle')"
  >
    <span class="skill-enabled-toggle-dot" />
    <span class="skill-enabled-toggle-label">{{ props.busy ? '切换中' : props.enabled ? '已启用' : '已停用' }}</span>
  </button>
</template>

<style scoped>
.skill-enabled-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 60px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid hsl(var(--border));
  border-radius: 7px;
  background: hsl(var(--muted) / 0.45);
  color: hsl(var(--muted-foreground));
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color var(--duration-base) var(--ease-standard),
    border-color var(--duration-base) var(--ease-standard),
    background var(--duration-base) var(--ease-standard);
}

.skill-enabled-toggle:hover:not(:disabled) {
  border-color: hsl(var(--muted-foreground) / 0.35);
  background: hsl(var(--muted) / 0.75);
}

.skill-enabled-toggle:focus-visible {
  outline: 2px solid hsl(var(--primary) / 0.45);
  outline-offset: 2px;
}

.skill-enabled-toggle:disabled {
  cursor: wait;
  opacity: 0.6;
}

.skill-enabled-toggle-dot {
  display: block;
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 50%;
  background: hsl(var(--muted-foreground) / 0.55);
}

.skill-enabled-toggle-label {
  line-height: 1;
}

.skill-enabled-toggle.enabled {
  border-color: hsl(var(--success) / 0.25);
  background: hsl(var(--success) / 0.1);
  color: hsl(var(--success));
}

.skill-enabled-toggle.enabled:hover:not(:disabled) {
  border-color: hsl(var(--success) / 0.4);
  background: hsl(var(--success) / 0.16);
}

.skill-enabled-toggle.enabled .skill-enabled-toggle-dot {
  background: hsl(var(--success));
  box-shadow: 0 0 0 2px hsl(var(--success) / 0.12);
}

.skill-enabled-toggle.busy .skill-enabled-toggle-dot {
  animation: skill-toggle-pulse 1s ease-in-out infinite;
}

@keyframes skill-toggle-pulse {
  0%,
  100% {
    opacity: 0.45;
  }

  50% {
    opacity: 1;
  }
}
</style>
