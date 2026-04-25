import {
  chatCompletion as providerChatCompletion,
  chatCompletionStream,
  type ChatMessage as ProviderChatMessage,
} from '../../../lib/ai/provider'
import { getProfilingLLMConfig } from './profiling-llm'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamCallbacks {
  onToken: (token: string) => void
  onDone: (fullText: string) => void
  onError: (error: Error) => void
}

function toProviderMessages(messages: ChatMessage[]): ProviderChatMessage[] {
  return messages.map(message => ({
    role: message.role,
    content: message.content,
  }))
}

export async function streamChat(
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  options?: { temperature?: number; maxTokens?: number; model?: string },
): Promise<void> {
  const baseConfig = getProfilingLLMConfig()
  const config = options?.model ? { ...baseConfig, model: options.model } : baseConfig

  await chatCompletionStream(
    config,
    toProviderMessages(messages),
    {
      onChunk: callbacks.onToken,
      onDone: callbacks.onDone,
      onError: callbacks.onError,
    },
    options?.temperature ?? 0.8,
    options?.maxTokens ?? 800,
  )
}

export async function chatCompletion(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number; model?: string },
): Promise<string> {
  const baseConfig = getProfilingLLMConfig()
  const config = options?.model ? { ...baseConfig, model: options.model } : baseConfig

  return providerChatCompletion(
    config,
    toProviderMessages(messages),
    options?.temperature ?? 0.8,
    options?.maxTokens ?? 800,
  )
}
