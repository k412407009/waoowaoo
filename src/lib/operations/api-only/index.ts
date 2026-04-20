import type { ProjectAgentOperationRegistry } from '@/lib/operations/types'
import { createAssetHubApiOperations } from './asset-hub-api-ops'
import { createAssetsApiOperations } from './assets-api-ops'

export function createApiOnlyOperationRegistry(): ProjectAgentOperationRegistry {
  return {
    ...createAssetsApiOperations(),
    ...createAssetHubApiOperations(),
  }
}
