import type { ProjectAgentOperationRegistry } from '@/lib/operations/types'
import { createAssetHubApiOperations } from './asset-hub-api-ops'
import { createAssetsApiOperations } from './assets-api-ops'
import { createUserApiConfigConnectionDiagnosticOperations } from './user-api-config-connection-ops'
import { createUserApiConfigTemplateDiagnosticOperations } from './user-api-config-template-ops'

export function createApiOnlyOperationRegistry(): ProjectAgentOperationRegistry {
  return {
    ...createAssetsApiOperations(),
    ...createAssetHubApiOperations(),
    ...createUserApiConfigTemplateDiagnosticOperations(),
    ...createUserApiConfigConnectionDiagnosticOperations(),
  }
}
