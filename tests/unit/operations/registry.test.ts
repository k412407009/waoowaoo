import { describe, expect, it } from 'vitest'
import { createProjectAgentOperationRegistry } from '@/lib/operations/registry'

describe('project agent operation registry', () => {
  it('keeps operation ids aligned and scopes defined', () => {
    const registry = createProjectAgentOperationRegistry()
    for (const [id, operation] of Object.entries(registry)) {
      expect(operation.id).toBe(id)
      expect(operation.scope).toBeTruthy()
      expect(operation.inputSchema).toBeDefined()
      expect(operation.outputSchema).toBeDefined()
    }
  })
})
