import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
})

export function renderMarkdown(content: string): string {
  if (!content) return ''
  return md.render(content)
}
