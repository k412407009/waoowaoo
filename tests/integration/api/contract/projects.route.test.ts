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
    requireUserAuth: async () => {
      if (!authState.authenticated) return unauthorized()
      return { session: { user: { id: 'user-1' } } }
    },
  }
})

vi.mock('@/lib/adapters/api/execute-project-agent-operation', () => apiAdapterMock)

import { GET as projectsGet, POST as projectsPost } from '@/app/api/projects/route'

describe('api contract - projects routes (operation adapter)', () => {
  beforeEach(() => {
    authState.authenticated = true
    vi.clearAllMocks()
  })

  it('GET /api/projects -> uses list_projects operation with system projectId', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValueOnce({
      projects: [],
      pagination: { page: 1, pageSize: 12, total: 0, totalPages: 0 },
    })

    const res = await projectsGet(buildMockRequest({
      path: '/api/projects',
      method: 'GET',
      query: { page: '1', pageSize: '12', search: 'a' },
    }), {} as unknown as { params: Promise<Record<string, never>> })

    expect(res.status).toBe(200)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenCalledWith(expect.objectContaining({
      operationId: 'list_projects',
      projectId: 'system',
      userId: 'user-1',
      input: expect.objectContaining({ page: 1, pageSize: 12, search: 'a' }),
    }))
  })

  it('POST /api/projects -> uses create_project operation and returns 201', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValueOnce({
      project: { id: 'project-1' },
    })

    const res = await projectsPost(buildMockRequest({
      path: '/api/projects',
      method: 'POST',
      body: { name: 'P' },
    }), {} as unknown as { params: Promise<Record<string, never>> })

    expect(res.status).toBe(201)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenCalledWith(expect.objectContaining({
      operationId: 'create_project',
      projectId: 'system',
      userId: 'user-1',
      input: { name: 'P' },
    }))
    await expect(res.json()).resolves.toEqual({ project: { id: 'project-1' } })
  })
})
