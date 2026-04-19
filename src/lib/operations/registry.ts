import { createProjectAgentOperationRegistry as createRawProjectAgentOperationRegistry } from './project-agent'
export type {
  ProjectAgentOperationContext,
  ProjectAgentOperationDefinition,
  ProjectAgentOperationRegistry,
} from './types'

export function createProjectAgentOperationRegistry() {
  const registry = createRawProjectAgentOperationRegistry()
  for (const [operationId, operation] of Object.entries(registry)) {
    if (operation.id !== operationId) {
      throw new Error(`PROJECT_AGENT_OPERATION_ID_MISMATCH:${operationId}:${operation.id}`)
    }
  }
  return registry
}
