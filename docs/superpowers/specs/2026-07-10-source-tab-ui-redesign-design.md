# 源码/内容标签页 UI 重新设计

## 概述

重新设计详情页中"源码/内容"标签页的 UI，简化布局，提升用户体验。

## 用户需求

1. **整体布局**：简化垂直布局，移除调试信息
2. **元数据区域**：紧凑卡片式，水平排列
3. **SKILL.md内容**：现代代码编辑器风格
4. **源链接卡片**：紧凑信息卡片，点击可打开文件夹/仓库
5. **本地链接功能**：能打开文件夹

## 当前实现分析

### 现有问题
- 调试信息区域仅在开发时有用，用户不需要
- 元数据区域使用4列网格，信息密度低
- 源链接卡片样式不统一，本地技能无法打开文件夹
- 代码块样式较简单，缺少现代编辑器特性

### 现有功能
- `projectOpenFolder()` 函数可用于打开文件夹
- `skill.repo` 和 `skill.sourceUrl` 用于获取仓库链接
- `skillDir` 用于获取本地技能目录

## 设计方案

### 方案：清洁简约风格

#### 1. 整体布局
- 移除调试信息区域（第308-316行）
- 垂直排列各部分，使用统一的间距
- 添加平滑的过渡动画

#### 2. 元数据区域
**当前实现**：
```html
<div class="meta-grid">
  <div class="meta-item">...</div>
  <div class="meta-item">...</div>
</div>
```

**新设计**：
```html
<div class="metadata-cards">
  <div class="metadata-card">
    <div class="metadata-icon">
      <svg>...</svg> <!-- 用户图标 -->
    </div>
    <div class="metadata-content">
      <span class="metadata-label">作者</span>
      <span class="metadata-value">{{ skill.author || '未知' }}</span>
    </div>
  </div>
  <div class="metadata-card">
    <div class="metadata-icon">
      <svg>...</svg> <!-- 标签图标 -->
    </div>
    <div class="metadata-content">
      <span class="metadata-label">ID</span>
      <span class="metadata-value mono">{{ skill.id }}</span>
    </div>
  </div>
</div>
```

**样式**：
```css
.metadata-cards {
  display: flex;
  gap: 12px;
}

.metadata-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: hsl(var(--accent) / 0.3);
  border: 1px solid hsl(var(--border) / 0.5);
  border-radius: 12px;
  flex: 1;
}

.metadata-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--primary) / 0.1);
  border-radius: 8px;
  color: hsl(var(--primary));
}

.metadata-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metadata-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: hsl(var(--muted-foreground));
}

.metadata-value {
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--foreground));
}

.metadata-value.mono {
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 12px;
}
```

#### 3. 源链接卡片
**当前实现**：
```html
<a class="source-link-card" :href="skill.sourceUrl || `https://github.com/${skill.repo}`" target="_blank" rel="noopener noreferrer">
  <svg>...</svg>
  <div class="source-link-info">
    <span class="source-link-name">访问技能仓库</span>
    <span class="source-link-path">{{ skill.repo }}</span>
  </div>
  <svg>...</svg> <!-- 箭头图标 -->
</a>
```

**新设计**：
```html
<div class="source-card" @click="openSource">
  <div class="source-icon">
    <svg v-if="skill.repo">...</svg> <!-- GitHub图标 -->
    <svg v-else>...</svg> <!-- 文件夹图标 -->
  </div>
  <div class="source-info">
    <span class="source-name">{{ skill.repo ? '访问技能仓库' : '本地技能' }}</span>
    <span class="source-path">{{ skill.repo || skillDir || '未知路径' }}</span>
  </div>
  <svg class="source-arrow">...</svg> <!-- 箭头图标 -->
</div>
```

**样式**：
```css
.source-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-radius: 12px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}

.source-card:hover {
  background: hsl(var(--accent) / 0.5);
  border-color: hsl(var(--primary) / 0.3);
}

.source-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--primary) / 0.1);
  border-radius: 10px;
  color: hsl(var(--primary));
  flex-shrink: 0;
}

.source-info {
  flex: 1;
  min-width: 0;
}

.source-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.source-path {
  display: block;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-arrow {
  color: hsl(var(--muted-foreground));
  flex-shrink: 0;
}
```

#### 4. SKILL.md内容区域
**当前实现**：
```html
<div class="source-code-card">
  <pre class="source-code-block">{{ skillContent }}</pre>
</div>
```

**新设计**：
```html
<div class="code-editor">
  <div class="code-header">
    <span class="code-filename">SKILL.md</span>
    <div class="code-actions">
      <button class="code-action-btn" @click="emit('copy-content', skillContent, 'source-md')">
        <svg v-if="copyStatus['source-md']">...</svg>
        <svg v-else>...</svg>
        {{ copyStatus['source-md'] ? '已复制' : '复制' }}
      </button>
    </div>
  </div>
  <div class="code-content">
    <pre class="code-block"><code>{{ skillContent }}</code></pre>
  </div>
</div>
```

**样式**：
```css
.code-editor {
  border-radius: 12px;
  border: 1px solid hsl(var(--border));
  overflow: hidden;
  background: hsl(var(--card));
}

.code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: hsl(var(--accent) / 0.3);
  border-bottom: 1px solid hsl(var(--border) / 0.5);
}

.code-filename {
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.code-actions {
  display: flex;
  gap: 8px;
}

.code-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 6px;
  border: none;
  background: hsl(var(--accent) / 0.6);
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}

.code-action-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}

.code-content {
  padding: 0;
}

.code-block {
  display: block;
  padding: 16px;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: hsl(var(--foreground) / 0.85);
  max-height: 60vh;
  overflow-y: auto;
  margin: 0;
  background: hsl(var(--background));
}

.code-block code {
  font-family: inherit;
}
```

## 实现步骤

### 1. 修改 `SkillDetailBase.vue`

#### 移除调试信息区域
删除第308-316行的调试信息部分。

#### 修改元数据区域
替换第293-305行的元数据区域为新的紧凑卡片设计。

#### 修改源链接卡片
替换第319-337行的源链接卡片为新的设计，添加点击打开功能。

#### 修改SKILL.md内容区域
替换第340-352行的代码块为新的编辑器风格设计。

### 2. 添加打开文件夹功能

在 `SkillDetailBase.vue` 中添加以下方法：

```typescript
function openSource() {
  if (props.skill.repo) {
    // 打开GitHub仓库
    const url = props.skill.sourceUrl || `https://github.com/${props.skill.repo}`
    window.open(url, '_blank')
  } else if (props.skillDir) {
    // 打开本地文件夹
    window.services.openFolder(props.skillDir)
  }
}
```

### 3. 更新样式

添加新的CSS样式，移除旧的样式。

## 验证

1. **功能验证**：
   - 点击源链接卡片能正确打开文件夹或仓库
   - 复制按钮能正常工作
   - 所有交互都有适当的反馈

2. **样式验证**：
   - 在亮色和暗色主题下都显示正常
   - 响应式布局在不同屏幕尺寸下正常
   - 过渡动画流畅

3. **兼容性验证**：
   - 不影响其他标签页的功能
   - 保持现有的API接口不变