import { z } from 'zod'
import { testLlmConnection } from '@/lib/user-api/llm-test-connection'
import { testProviderConnection } from '@/lib/user-api/provider-test'
import type { ProjectAgentOperationRegistry } from '@/lib/operations/types'

export function createUserApiConfigConnectionDiagnosticOperations(): ProjectAgentOperationRegistry {
  return {
    api_user_api_config_test_connection: {
      id: 'api_user_api_config_test_connection',
      description: 'API-only: Test LLM connection with user-provided provider/baseUrl/apiKey.',
      sideEffects: { mode: 'act', risk: 'low', longRunning: true },
      scope: 'user',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      execute: async (_ctx, input) => {
        const startedAt = Date.now()
        const payload = input as Parameters<typeof testLlmConnection>[0]
        const result = await testLlmConnection(payload)
        return {
          success: true,
          latencyMs: Date.now() - startedAt,
          ...result,
        }
      },
    },

    api_user_api_config_test_provider: {
      id: 'api_user_api_config_test_provider',
      description: 'API-only: Run provider multi-step connection diagnostics.',
      sideEffects: { mode: 'act', risk: 'low', longRunning: true },
      scope: 'user',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      execute: async (_ctx, input) => {
        const startedAt = Date.now()
        const payload = input as Parameters<typeof testProviderConnection>[0]
        const result = await testProviderConnection(payload)
        return {
          ...result,
          latencyMs: Date.now() - startedAt,
        }
      },
    },
  }
}

