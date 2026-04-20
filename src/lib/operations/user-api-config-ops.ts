import { z } from 'zod'
import { getUserApiConfig, putUserApiConfig } from '@/lib/user-api/api-config'
import type { ProjectAgentOperationRegistry } from './types'

export function createUserApiConfigOperations(): ProjectAgentOperationRegistry {
  return {
    get_user_api_config: {
      id: 'get_user_api_config',
      description: 'Read user API config (decrypted providers, pricing/capabilities enrichment).',
      sideEffects: { mode: 'query', risk: 'low' },
      scope: 'system',
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx) => await getUserApiConfig(ctx.userId),
    },
    put_user_api_config: {
      id: 'put_user_api_config',
      description: 'Save/update user API config.',
      sideEffects: { mode: 'act', risk: 'low', overwrite: true },
      scope: 'system',
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => await putUserApiConfig(ctx.userId, input),
    },
  }
}

