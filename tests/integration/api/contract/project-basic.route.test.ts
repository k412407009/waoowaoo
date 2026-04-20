import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({
  authenticated: true,
}))

const apiAdapterMock = vi.hoisted(() => ({
  executeProjectAgentOperationFromApi: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireProjectAuthLight: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1', name: 'Project' },
      }
    },
  }
})

vi.mock('@/lib/adapters/api/execute-project-agent-operation', () => apiAdapterMock)

import { GET as projectGet, PATCH as projectPatch, DELETE as projectDelete } from '@/app/api/projects/[projectId]/route'

describe('api contract - project basic route (operation adapter)', () => {
  beforeEach(() => {
    authState.authenticated = true
    vi.clearAllMocks()
  })

  it('GET /api/projects/[projectId] -> uses get_project_basic operation', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValueOnce({ project: { id: 'project-1' } })

    const res = await projectGet(
      buildMockRequest({ path: '/api/projects/project-1', method: 'GET' }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(res.status).toBe(200)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenCalledWith(expect.objectContaining({
      operationId: 'get_project_basic',
      projectId: 'project-1',
      userId: 'user-1',
      input: {},
    }))
  })

  it('PATCH /api/projects/[projectId] -> uses update_project operation', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValueOnce({ project: { id: 'project-1', name: 'n' } })

    const res = await projectPatch(
      buildMockRequest({ path: '/api/projects/project-1', method: 'PATCH', body: { name: 'n' } }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(res.status).toBe(200)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenCalledWith(expect.objectContaining({
      operationId: 'update_project',
      projectId: 'project-1',
      userId: 'user-1',
      input: { name: 'n' },
    }))
  })

  it('DELETE /api/projects/[projectId] -> uses delete_project operation', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValueOnce({ success: true })

    const res = await projectDelete(
      buildMockRequest({ path: '/api/projects/project-1', method: 'DELETE' }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(res.status).toBe(200)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenCalledWith(expect.objectContaining({
      operationId: 'delete_project',
      projectId: 'project-1',
      userId: 'user-1',
      input: {},
    }))
  })
})

