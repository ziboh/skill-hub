<script setup lang="ts">
import StoreIconPicker, { type IconLibraryPreset } from './StoreIconPicker.vue'

withDefaults(
  defineProps<{
    modelValue?: string
    title?: string
    library?: IconLibraryPreset
    defaultIcon?: string
  }>(),
  {
    modelValue: '',
    title: '选择图标',
    library: 'providers',
    defaultIcon: '',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  close: []
}>()
</script>

<template>
  <div class="icon-picker-overlay">
    <div class="icon-picker-modal" role="dialog" aria-modal="true" :aria-label="title">
      <div class="icon-picker-modal-header">
        <h3 class="icon-picker-modal-title">{{ title }}</h3>
        <button class="icon-picker-modal-close" type="button" aria-label="关闭" @click="emit('close')">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div class="icon-picker-modal-body">
        <StoreIconPicker
          :model-value="modelValue"
          :library="library"
          :default-icon="defaultIcon"
          @update:model-value="emit('update:modelValue', $event)"
        />
      </div>

      <div class="icon-picker-modal-footer">
        <button class="icon-picker-modal-done" type="button" @click="emit('close')">完成</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.icon-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(0 0% 0% / 0.5);
  backdrop-filter: blur(4px);
  animation: icon-picker-fade-in var(--duration-quick) var(--ease-standard);
}

@keyframes icon-picker-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.icon-picker-modal {
  width: min(560px, 90vw);
  height: min(800px, calc(100vh - 24px));
  max-height: calc(100vh - 24px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  box-shadow: 0 20px 60px hsl(0 0% 0% / 0.2);
  animation: icon-picker-slide-up var(--duration-base) var(--ease-standard);
}

@keyframes icon-picker-slide-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.icon-picker-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 16px 20px;
  border-bottom: 1px solid hsl(var(--border));
}

.icon-picker-modal-title {
  margin: 0;
  color: hsl(var(--foreground));
  font-size: 16px;
  font-weight: 600;
}

.icon-picker-modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}

.icon-picker-modal-close:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.icon-picker-modal-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
  overflow: hidden;
}

.icon-picker-modal-body :deep(.store-icon-picker) {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.icon-picker-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid hsl(var(--border));
  background: hsl(var(--muted) / 0.2);
}

.icon-picker-modal-done {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 8px 16px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}

.icon-picker-modal-done:hover {
  opacity: 0.9;
}
</style>
