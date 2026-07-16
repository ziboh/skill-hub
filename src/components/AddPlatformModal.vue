<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { PlatformInfo } from '../types'
import ProviderIcon from './ProviderIcon.vue'
import StoreIconPicker from './StoreIconPicker.vue'
import { platformDisplayIcon } from '../data/platforms'

const props = defineProps<{
  platform?: PlatformInfo | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (
    e: 'submit',
    data: {
      id?: string
      name: string
      defaultPath: string
      projectPath?: string
      icon?: string
    },
  ): void
}>()

const name = ref('')
const defaultPath = ref('')
const projectPath = ref('')
const icon = ref('')
const error = ref('')
const isSubmitting = ref(false)
const showIconPicker = ref(false)

const isEdit = computed(() => !!props.platform)

watch(
  () => props.platform,
  (p) => {
    if (p) {
      name.value = p.name || ''
      defaultPath.value = p.customPath || p.defaultPath || ''
      projectPath.value = p.customProjectPath || p.projectPath || ''
      icon.value = p.icon || ''
    } else {
      name.value = ''
      defaultPath.value = ''
      projectPath.value = ''
      icon.value = ''
    }
    error.value = ''
    isSubmitting.value = false
    showIconPicker.value = false
  },
  { immediate: true },
)

const previewIcon = computed(() => platformDisplayIcon({ id: props.platform?.id || '_generic', icon: icon.value }))

async function selectFolder() {
  try {
    const dialog = window.ztools?.showOpenDialog
    if (!dialog) {
      error.value = '文件选择对话框不可用，请手动输入路径。'
      return
    }
    const dirs = dialog({
      properties: ['openDirectory'],
      title: '选择全局技能目录',
    })
    if (dirs && dirs.length > 0) {
      defaultPath.value = dirs[0]
      error.value = ''
      if (!name.value) {
        name.value = dirs[0].split(/[/\\]/).filter(Boolean).pop() || ''
      }
    }
  } catch {
    error.value = '选择文件夹失败，请手动输入路径。'
  }
}

function handleSubmit() {
  const n = name.value.trim()
  const path = defaultPath.value.trim()
  if (!n) {
    error.value = '请输入平台名称。'
    return
  }
  if (!path) {
    error.value = '请输入全局技能目录路径。'
    return
  }
  error.value = ''
  isSubmitting.value = true
  emit('submit', {
    id: props.platform?.id,
    name: n,
    defaultPath: path,
    projectPath: projectPath.value.trim() || undefined,
    icon: icon.value.trim() || undefined,
  })
}
</script>

<template>
  <div class="modal-overlay">
    <div class="modal-panel">
      <div class="modal-header">
        <h2 class="modal-title">{{ isEdit ? '编辑平台' : '添加平台' }}</h2>
        <button class="modal-close" @click="emit('close')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label class="field-label">平台名称</label>
          <input v-model="name" type="text" class="field-input" placeholder="例如 My Agent" />
        </div>

        <div class="field">
          <label class="field-label">全局技能目录</label>
          <div class="field-row">
            <input v-model="defaultPath" type="text" class="field-input" placeholder="~/.my-agent/skills（支持 ~）" />
            <button class="btn-browse" type="button" @click="selectFolder">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              </svg>
              浏览
            </button>
          </div>
        </div>

        <div class="field">
          <label class="field-label">项目相对路径（可选）</label>
          <input v-model="projectPath" type="text" class="field-input" placeholder="例如 .my-agent/skills/" />
        </div>

        <div class="field">
          <label class="field-label">图标</label>
          <button type="button" class="icon-picker-trigger" @click="showIconPicker = true">
            <ProviderIcon :icon="previewIcon" :size="28" variant="mono" />
            <span class="icon-picker-label">{{ icon || '默认' }}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>
      <div class="modal-footer">
        <div v-if="error" class="modal-error">{{ error }}</div>
        <button class="btn-cancel" type="button" @click="emit('close')">取消</button>
        <button class="btn-primary" type="button" :disabled="isSubmitting || !name.trim() || !defaultPath.trim()" @click="handleSubmit">
          {{ isSubmitting ? '保存中…' : isEdit ? '保存' : '添加平台' }}
        </button>
      </div>
    </div>
  </div>

  <div v-if="showIconPicker" class="modal-overlay icon-overlay">
    <div class="modal-panel icon-panel">
      <div class="modal-header">
        <h2 class="modal-title">选择图标</h2>
        <button class="modal-close" type="button" @click="showIconPicker = false">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="modal-body icon-body">
        <StoreIconPicker v-model="icon" library="platforms" default-icon="_generic" />
      </div>
      <div class="modal-footer">
        <button class="btn-primary" type="button" @click="showIconPicker = false">完成</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal-panel {
  width: min(520px, calc(100vw - 32px));
  max-height: min(640px, calc(100vh - 32px));
  display: flex;
  flex-direction: column;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px 0;
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  color: hsl(var(--foreground));
  margin: 0;
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
}

.modal-close:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.modal-body {
  padding: 12px 20px 14px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--foreground));
}

.field-row {
  display: flex;
  gap: 8px;
}

.field-input {
  flex: 1;
  min-width: 0;
  width: 100%;
  height: 36px;
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  font-size: 13px;
  outline: none;
  transition: all var(--duration-base) var(--ease-standard);
}

.field-input:focus {
  border-color: hsl(var(--ring));
  box-shadow: 0 0 0 3px hsl(var(--ring) / 0.12);
}

.field-input::placeholder {
  color: hsl(var(--muted-foreground));
}

.btn-browse {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.btn-browse:hover {
  background: hsl(var(--accent));
}

.icon-picker-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 48px;
  padding: 0 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  cursor: pointer;
  text-align: left;
}

.icon-picker-trigger:hover {
  border-color: hsl(var(--primary));
}

.icon-picker-label {
  flex: 1;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 20px 14px;
  border-top: 1px solid hsl(var(--border));
}

.modal-error {
  flex: 1;
  font-size: 12px;
  color: hsl(var(--destructive));
  margin-right: 8px;
}

.btn-cancel,
.btn-primary {
  height: 36px;
  padding: 0 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
}

.btn-cancel {
  background: transparent;
  color: hsl(var(--muted-foreground));
  border: 1px solid hsl(var(--border));
}

.btn-cancel:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.btn-primary {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary:not(:disabled):hover {
  filter: brightness(1.05);
}

.icon-overlay {
  z-index: 1100;
}

.icon-panel {
  width: min(560px, 90vw);
  height: min(720px, calc(100vh - 32px));
  max-height: min(720px, calc(100vh - 32px));
  display: flex;
  flex-direction: column;
}

.icon-body {
  flex: 1;
  min-height: 0;
  padding: 12px 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.icon-body :deep(.store-icon-picker) {
  flex: 1;
  min-height: 0;
  height: 100%;
}
</style>
