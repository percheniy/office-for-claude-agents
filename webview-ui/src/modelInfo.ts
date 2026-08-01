/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

const FALLBACK_CONTEXT_LIMIT = 200000

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "claude-opus-4-6": 200000,
  "claude-sonnet-4-6": 200000,
  "claude-haiku-4-5": 200000,
  "gpt-5.4": 200000,
  "gpt-5.4-mini": 200000,
  "gpt-5.3": 200000,
  "gpt-5.3-mini": 200000,
}

export interface ModelInfo {
  provider: string
  shortName: string
  rawName: string
}

const MODEL_FAMILIES: Array<{ provider: string; matches: RegExp }> = [
  { provider: 'Anthropic', matches: /(?:^|[/.:_-])(claude|opus|sonnet|haiku)(?:$|[/.:_-])/i },
  { provider: 'OpenAI', matches: /(?:^|[/.:_-])(openai|chatgpt|gpt|o[134]|codex)(?:$|[/.:_-])/i },
  { provider: 'Google', matches: /(?:^|[/.:_-])(google|gemini)(?:$|[/.:_-])/i },
  { provider: 'Moonshot AI', matches: /(?:^|[/.:_-])(moonshot|kimi)(?:$|[/.:_-])/i },
  { provider: 'DeepSeek', matches: /(?:^|[/.:_-])deepseek(?:$|[/.:_-])/i },
  { provider: 'Alibaba', matches: /(?:^|[/.:_-])(alibaba|qwen)(?:$|[/.:_-])/i },
  { provider: 'xAI', matches: /(?:^|[/.:_-])(xai|grok)(?:$|[/.:_-])/i },
  { provider: 'Mistral AI', matches: /(?:^|[/.:_-])(mistral|codestral|ministral)(?:$|[/.:_-])/i },
  { provider: 'Meta', matches: /(?:^|[/.:_-])(meta|llama)(?:$|[/.:_-])/i },
  { provider: 'Cohere', matches: /(?:^|[/.:_-])(cohere|command-r)(?:$|[/.:_-])/i },
  { provider: 'Amazon', matches: /(?:^|[/.:_-])(amazon|nova)(?:$|[/.:_-])/i },
  { provider: 'Microsoft', matches: /(?:^|[/.:_-])(microsoft|phi)(?:$|[/.:_-])/i },
  { provider: 'Zhipu AI', matches: /(?:^|[/.:_-])(zhipu|glm)(?:$|[/.:_-])/i },
]

function compactModelName(model: string): string {
  const withoutProviderPath = model.trim().split('/').filter(Boolean).pop() || model.trim()
  if (withoutProviderPath.length <= 24) return withoutProviderPath
  return `${withoutProviderPath.slice(0, 23)}…`
}

export function getContextLimit(model?: string): number {
  if (!model) return FALLBACK_CONTEXT_LIMIT

  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (model.toLowerCase().includes(key)) {
      return limit
    }
  }

  // The live limit reported by the agent session is authoritative. This value
  // is only a visual fallback when a provider does not report one.
  return FALLBACK_CONTEXT_LIMIT
}

export function getModelInfo(model?: string): ModelInfo | null {
  if (!model) return null

  const rawName = model.trim()
  if (!rawName) return null
  const family = MODEL_FAMILIES.find(({ matches }) => matches.test(rawName))

  return {
    provider: family?.provider ?? 'Other',
    shortName: compactModelName(rawName),
    rawName,
  }
}

export function getModelShortName(model?: string): string | null {
  return getModelInfo(model)?.shortName ?? null
}
