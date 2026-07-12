import {
  ICON_OPENAI,
  ICON_GITHUB,
  ICON_GITHUB_ACTIONS,
  ICON_PLAYWRIGHT,
  ICON_HTML5,
  ICON_DOCKER,
  ICON_JUPYTER,
  ICON_LINEAR,
  ICON_NOTION,
  ICON_SENTRY,
  ICON_VERCEL,
  ICON_NETLIFY,
  ICON_CLOUDFLARE,
  ICON_FIGMA,
  ICON_LOCK,
  ICON_SHEETS,
} from '../icons/skill-builtin-assets'

export interface BuiltinRegistryEntry {
  slug: string
  iconUrl: string
  category: string
  author: string
}

export const OPENAI_SKILL_REGISTRY: Record<string, BuiltinRegistryEntry> = {
  spreadsheet: { slug: 'spreadsheet-openai', iconUrl: ICON_SHEETS, category: 'dev', author: 'OpenAI' },
  yeet: { slug: 'yeet', iconUrl: ICON_GITHUB, category: 'dev', author: 'OpenAI' },
  playwright: { slug: 'playwright', iconUrl: ICON_PLAYWRIGHT, category: 'testing', author: 'OpenAI' },
  'gh-fix-ci': { slug: 'gh-fix-ci', iconUrl: ICON_GITHUB_ACTIONS, category: 'ops', author: 'OpenAI' },
  'gh-address-comments': { slug: 'gh-address-comments', iconUrl: ICON_GITHUB, category: 'dev', author: 'OpenAI' },
  'develop-web-game': { slug: 'develop-web-game', iconUrl: ICON_HTML5, category: 'dev', author: 'OpenAI' },
  screenshot: { slug: 'screenshot', iconUrl: ICON_OPENAI, category: 'testing', author: 'OpenAI' },
  'docker-compose': { slug: 'docker-compose', iconUrl: ICON_DOCKER, category: 'ops', author: 'OpenAI' },
  imagegen: { slug: 'imagegen', iconUrl: ICON_OPENAI, category: 'content', author: 'OpenAI' },
  transcribe: { slug: 'transcribe', iconUrl: ICON_OPENAI, category: 'content', author: 'OpenAI' },
  'jupyter-notebook': { slug: 'jupyter-notebook', iconUrl: ICON_JUPYTER, category: 'search', author: 'OpenAI' },
  linear: { slug: 'linear', iconUrl: ICON_LINEAR, category: 'dev', author: 'OpenAI' },
  'notion-knowledge-capture': { slug: 'notion-knowledge-capture', iconUrl: ICON_NOTION, category: 'dev', author: 'OpenAI' },
  sentry: { slug: 'sentry', iconUrl: ICON_SENTRY, category: 'ops', author: 'OpenAI' },
  'vercel-deploy': { slug: 'vercel-deploy', iconUrl: ICON_VERCEL, category: 'ops', author: 'OpenAI' },
  'netlify-deploy': { slug: 'netlify-deploy', iconUrl: ICON_NETLIFY, category: 'ops', author: 'OpenAI' },
  'cloudflare-deploy': { slug: 'cloudflare-deploy', iconUrl: ICON_CLOUDFLARE, category: 'ops', author: 'OpenAI' },
  figma: { slug: 'figma', iconUrl: ICON_FIGMA, category: 'content', author: 'OpenAI' },
  'security-best-practices': { slug: 'security-best-practices', iconUrl: ICON_LOCK, category: 'dev', author: 'OpenAI' },
}

export const CLAUDE_SKILL_REGISTRY: Record<string, BuiltinRegistryEntry> = {
  'webapp-testing': { slug: 'webapp-testing', iconUrl: ICON_GITHUB, category: 'testing', author: 'Anthropic' },
  pptx: { slug: 'pptx', iconUrl: ICON_OPENAI, category: 'content', author: 'Anthropic' },
  pdf: { slug: 'pdf', iconUrl: ICON_OPENAI, category: 'content', author: 'Anthropic' },
  docx: { slug: 'docx', iconUrl: ICON_OPENAI, category: 'content', author: 'Anthropic' },
  xlsx: { slug: 'xlsx', iconUrl: ICON_OPENAI, category: 'content', author: 'Anthropic' },
  'pptx-generator': { slug: 'pptx-generator', iconUrl: ICON_OPENAI, category: 'content', author: 'Anthropic' },
  'mcp-builder': { slug: 'mcp-builder', iconUrl: ICON_OPENAI, category: 'dev', author: 'Anthropic' },
  'skill-creator': { slug: 'skill-creator', iconUrl: ICON_OPENAI, category: 'other', author: 'Anthropic' },
}

export function lookupBuiltinIcon(repo: string, slug: string): string | undefined {
  if (repo.includes('openai/skills')) {
    return OPENAI_SKILL_REGISTRY[slug]?.iconUrl
  }
  if (repo.includes('anthropics/skills')) {
    return CLAUDE_SKILL_REGISTRY[slug]?.iconUrl
  }
  return undefined
}

export function lookupBuiltinCategory(repo: string, slug: string): string | undefined {
  if (repo.includes('openai/skills')) {
    return OPENAI_SKILL_REGISTRY[slug]?.category
  }
  if (repo.includes('anthropics/skills')) {
    return CLAUDE_SKILL_REGISTRY[slug]?.category
  }
  return undefined
}
