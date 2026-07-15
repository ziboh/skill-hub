import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
})

md.renderer.rules.table_open = () => '<div class="markdown-table-scroll"><table>\n'
md.renderer.rules.table_close = () => '</table></div>\n'

export function renderMarkdown(content: string): string {
  if (!content) return ''
  return md.render(content)
}
