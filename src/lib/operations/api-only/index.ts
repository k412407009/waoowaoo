import type { ProjectAgentOperationRegistry } from '@/lib/operations/types'
import { createAssetsApiOperations } from './assets-api-ops'

export function createApiOnlyOperationRegistry(): ProjectAgentOperationRegistry {
  return {
    ...createAssetsApiOperations(),
  }
}
