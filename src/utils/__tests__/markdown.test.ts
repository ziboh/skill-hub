import { describe, expect, test } from 'vitest'
import { renderMarkdown } from '../markdown'

describe('renderMarkdown', () => {
  test('为表格生成横向滚动容器，避免撑开详情预览', () => {
    const html = renderMarkdown('| 名称 | 很长的内容 |\n| --- | --- |\n| 示例 | 内容 |')

    expect(html).toContain('<div class="markdown-table-scroll"><table>')
    expect(html).toContain('</table></div>')
  })
})
