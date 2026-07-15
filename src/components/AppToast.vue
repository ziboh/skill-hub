<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import type { LegacyNotificationType, NotificationOptions, NotificationType, ShowToast } from '../inject-keys'
import type { ToastPosition } from '../types'

const props = withDefaults(defineProps<{ position?: ToastPosition }>(), {
  position: 'center-bottom',
})

const DEFAULT_DURATIONS: Record<NotificationType, number> = {
  notification: 3000,
  success: 3000,
  warning: 5000,
  error: 8000,
}

export interface ToastItem {
  id: string
  message: string
  type: NotificationType
  title: string
  duration: number
  action?: NotificationOptions['action']
  leaving?: boolean
}

const toasts = ref<ToastItem[]>([])
const expandedMessageId = ref<string | null>(null)
const exitTimers = new Map<string, ReturnType<typeof setTimeout>>()

let idCounter = 0

function normalizeType(type?: LegacyNotificationType): NotificationType {
  return type === 'info' ? 'notification' : type || 'notification'
}

function clearToastTimers(id: string) {
  const autoTimer = exitTimers.get(id + ':auto')
  if (autoTimer) {
    clearTimeout(autoTimer)
    exitTimers.delete(id + ':auto')
  }

  const exitTimer = exitTimers.get(id)
  if (exitTimer) {
    clearTimeout(exitTimer)
    exitTimers.delete(id)
  }
}

function removeToast(id: string) {
  toasts.value = toasts.value.filter((t) => t.id !== id)
  if (expandedMessageId.value === id) expandedMessageId.value = null
  clearToastTimers(id)
}

function scheduleRemoval(id: string) {
  const exitTimer = setTimeout(() => removeToast(id), 160)
  exitTimers.set(id, exitTimer)
}

function closeToast(id: string) {
  const toast = toasts.value.find((t) => t.id === id)
  if (!toast || toast.leaving) return

  const autoTimer = exitTimers.get(id + ':auto')
  if (autoTimer) {
    clearTimeout(autoTimer)
    exitTimers.delete(id + ':auto')
  }

  toast.leaving = true
  scheduleRemoval(id)
}

function handleAction(toast: ToastItem) {
  try {
    toast.action?.onClick()
  } finally {
    closeToast(toast.id)
  }
}

const showToast: ShowToast = (input: string | NotificationOptions, legacyType?: LegacyNotificationType) => {
  const rawOptions: NotificationOptions = typeof input === 'string' ? { message: input } : input
  const type = normalizeType(typeof input === 'string' ? legacyType : input.type)
  const id = `${Date.now()}-${++idCounter}`
  const toast: ToastItem = {
    id,
    message: rawOptions.message,
    type,
    title: rawOptions.title || '',
    duration: rawOptions.duration ?? DEFAULT_DURATIONS[type],
    action: rawOptions.action,
  }

  toasts.value.push(toast)

  if (toast.duration > 0) {
    const autoTimer = setTimeout(() => {
      exitTimers.delete(id + ':auto')
      const currentToast = toasts.value.find((t) => t.id === id)
      if (currentToast && !currentToast.leaving) {
        currentToast.leaving = true
        scheduleRemoval(id)
      }
    }, toast.duration)
    exitTimers.set(id + ':auto', autoTimer)
  }
}

onUnmounted(() => {
  exitTimers.forEach(clearTimeout)
  exitTimers.clear()
})

defineExpose({ showToast })

watch(expandedMessageId, (id) => {
  if (!id) return
  const autoTimerKey = id + ':auto'
  const autoTimer = exitTimers.get(autoTimerKey)
  if (autoTimer) {
    clearTimeout(autoTimer)
    exitTimers.delete(autoTimerKey)
  }
})
</script>

<template>
  <Teleport to="body">
    <div class="toast-container" :class="`toast-position-${props.position}`">
      <TransitionGroup name="toast">
        <div v-for="t in toasts" :key="t.id" class="toast-item" :class="[`toast-${t.type}`, { 'toast-leaving': t.leaving }]">
          <div class="toast-icon" aria-hidden="true">
            <svg
              v-if="t.type === 'success'"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <svg
              v-else-if="t.type === 'error'"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <svg
              v-else-if="t.type === 'warning'"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <svg
              v-else
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <div class="toast-content">
            <div v-if="t.title" class="toast-title">{{ t.title }}</div>
            <span
              class="toast-message"
              :class="{ expanded: expandedMessageId === t.id }"
              :title="expandedMessageId === t.id ? '' : t.message"
              @click="expandedMessageId = expandedMessageId === t.id ? null : t.id"
              >{{ t.message }}</span
            >
          </div>
          <button v-if="t.action" class="toast-action" type="button" @click="handleAction(t)">
            {{ t.action.label }}
          </button>
          <button class="toast-close" type="button" :aria-label="t.title ? `关闭${t.title}` : '关闭提示'" @click="closeToast(t.id)">
            <svg
              width="14"
              height="14"
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
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.toast-position-center-bottom {
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
}

.toast-position-center-top {
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
}

.toast-position-top-right {
  top: 24px;
  right: 24px;
  align-items: flex-end;
}

.toast-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-radius: 16px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  box-shadow: 0 12px 32px hsl(0 0% 0% / 0.12);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  pointer-events: auto;
  min-width: 260px;
  max-width: 520px;
}

.toast-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.toast-notification .toast-icon {
  color: hsl(var(--primary));
}
.toast-success .toast-icon {
  color: hsl(var(--success));
}
.toast-error .toast-icon {
  color: hsl(var(--destructive));
}
.toast-warning .toast-icon {
  color: hsl(var(--warning));
}

.toast-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.toast-title {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
  color: hsl(var(--foreground));
}

.toast-message {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.45;
  color: hsl(var(--foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition: all var(--duration-quick) var(--ease-standard);
}
.toast-message.expanded {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
}

.toast-action {
  flex-shrink: 0;
  padding: 5px 9px;
  border: 1px solid hsl(var(--border));
  border-radius: 7px;
  background: transparent;
  color: hsl(var(--primary));
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.toast-action:hover {
  background: hsl(var(--accent));
}

.toast-close {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--duration-quick) var(--ease-standard);
}
.toast-close:hover {
  background: hsl(var(--accent));
}

/* Transition */
.toast-enter-active {
  animation: toastIn var(--duration-base) var(--ease-enter);
}
.toast-leave-active {
  animation: toastOut var(--duration-quick) var(--ease-exit);
}

@keyframes toastIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes toastOut {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(20px);
  }
}
</style>
