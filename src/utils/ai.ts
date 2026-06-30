import type { ModelConfig, ErrorCategory } from '../types'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  temperature?: number
  maxTokens?: number
  timeout?: number
}

export interface ChatResult {
  content: string
}

export interface ModelInfo {
  id: string
  name: string
  owned_by?: string
}

export interface FetchModelsResult {
  success: boolean
  models: ModelInfo[]
  error?: string
}

export interface AIErrorDetails {
  message: string
  category: ErrorCategory
  model?: string
  provider?: string
  endpoint?: string
  statusCode?: number
  requestId?: string
  duration?: number
  rawResponse?: string
}

export class AIError extends Error {
  details: AIErrorDetails

  constructor(details: AIErrorDetails) {
    super(details.message)
    this.name = 'AIError'
    this.details = details
  }
}

export async function chatCompletion(
  model: ModelConfig,
  messages: ChatMessage[],
  options?: ChatOptions,
): Promise<ChatResult> {
  const activeKey = model.apiKeys?.find(k => k.enabled)?.key
  if (!activeKey || !model.baseUrl || !model.apiPath || !model.model) {
    throw new AIError({
      message: 'AI 未配置：缺少 API Key、Base URL 或模型配置',
      category: 'config',
      model: model.model,
      provider: model.provider,
    })
  }

  const endpoint = `${model.baseUrl.replace(/\/+$/, '')}${model.apiPath}`
  const startTime = Date.now()

  const body = {
    model: model.model,
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 8192,
    stream: false,
  }

  let res: Response
  try {
    const controller = new AbortController()
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    if (options?.timeout && options.timeout > 0) {
      timeoutId = setTimeout(() => controller.abort(), options.timeout * 1000)
    }
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
    }
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError'
    throw new AIError({
      message: isTimeout
        ? `请求超时 (${options?.timeout ?? 60}s): 服务器响应时间过长`
        : `网络请求失败: ${err.message || '无法连接到服务器'}`,
      category: isTimeout ? 'network' : 'network',
      model: model.model,
      provider: model.provider,
      endpoint,
      duration: Date.now() - startTime,
    })
  }

  const duration = Date.now() - startTime
  const requestId = res.headers.get('x-request-id') || res.headers.get('request-id') || undefined

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const isHtml = text.includes('<!DOCTYPE') || text.includes('<html')
    let errorMsg = text.substring(0, 200) || '未知错误'
    if (isHtml) {
      const titleMatch = text.match(/<title>(.*?)<\/title>/i)
      errorMsg = titleMatch ? titleMatch[1].trim() : `服务器返回 HTML 错误页面 (${res.status})`
    }
    if (res.status === 401 || res.status === 403) {
      throw new AIError({
        message: `认证失败 (${res.status}): API Key 无效或无权限`,
        category: 'auth',
        model: model.model,
        provider: model.provider,
        endpoint,
        statusCode: res.status,
        requestId,
        duration,
        rawResponse: text || undefined,
      })
    }
    throw new AIError({
      message: `API 错误 (${res.status}): ${errorMsg}`,
      category: isHtml ? 'network' : 'api',
      model: model.model,
      provider: model.provider,
      endpoint,
      statusCode: res.status,
      requestId,
      duration,
      rawResponse: text || undefined,
    })
  }

  let data: any
  try {
    data = await res.json()
  } catch {
    const text = await res.text().catch(() => '')
    const isHtml = text.includes('<!DOCTYPE') || text.includes('<html')
    let errorMsg = '返回的内容不是有效的 JSON'
    if (isHtml) {
      const titleMatch = text.match(/<title>(.*?)<\/title>/i)
      errorMsg = titleMatch ? titleMatch[1].trim() : `服务器返回 HTML 错误页面 (${res.status})`
    }
    throw new AIError({
      message: `响应解析失败: ${errorMsg}`,
      category: isHtml ? 'network' : 'response',
      model: model.model,
      provider: model.provider,
      endpoint,
      statusCode: res.status,
      requestId,
      duration,
      rawResponse: text || undefined,
    })
  }

  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    throw new AIError({
      message: '响应内容为空: AI 未返回任何内容',
      category: 'response',
      model: model.model,
      provider: model.provider,
      endpoint,
      statusCode: res.status,
      requestId,
      duration,
      rawResponse: JSON.stringify(data) || undefined,
    })
  }

  return { content }
}

export async function fetchAvailableModels(
  baseUrl: string,
  apiKey: string,
): Promise<FetchModelsResult> {
  if (!apiKey || !baseUrl) {
    return { success: false, models: [], error: '请先填写 API Key 和 API 地址' }
  }

  try {
    const endpoint = `${baseUrl.replace(/\/+$/, '')}/v1/models`
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const reason =
        res.status === 401 || res.status === 403
          ? 'auth'
          : res.status === 404 || res.status === 405
            ? 'unsupported'
            : 'http'
      return {
        success: false,
        models: [],
        error: `获取模型列表失败: ${res.status} - ${text.substring(0, 100)}`,
        reason,
      } as any
    }

    let data: any
    try {
      data = await res.json()
    } catch {
      return {
        success: false,
        models: [],
        error: `获取模型列表失败: 无效的 JSON 响应`,
        reason: 'http',
      } as any
    }

    if (data?.data && Array.isArray(data.data)) {
      const models = data.data
        .filter((m: any) => m.id)
        .map((m: any) => ({
          id: m.id,
          name: m.id,
          owned_by: m.owned_by,
        }))
        .sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id))
      return { success: true, models }
    }

    if (data?.models && Array.isArray(data.models)) {
      const models = data.models
        .filter((m: any) => m.name)
        .map((m: any) => {
          const id = m.name.replace(/^models\//, '')
          return { id, name: m.displayName ? `${m.displayName} (${id})` : id, owned_by: 'Google' }
        })
        .sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id))
      return { success: true, models }
    }

    if (Array.isArray(data)) {
      const models = data
        .filter((m: any) => m.id || m.model)
        .map((m: any) => ({ id: m.id || m.model || '', name: m.name || m.id || m.model }))
      return { success: true, models }
    }

    return { success: false, models: [], error: '无法解析模型列表响应' }
  } catch (err: any) {
    return { success: false, models: [], error: err.message || '获取模型列表失败' }
  }
}
