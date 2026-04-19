import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

function parseReferenceImages(body: Record<string, unknown>): string[] {
  const list = Array.isArray(body.referenceImageUrls)
    ? body.referenceImageUrls.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : []
  if (list.length > 0) return list.slice(0, 5)
  const single = typeof body.referenceImageUrl === 'string' ? body.referenceImageUrl.trim() : ''
  return single ? [single] : []
}

/**
 * 项目级 - 参考图转角色（任务化）
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const referenceImages = parseReferenceImages(body)
  if (referenceImages.length === 0) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'reference_to_character',
    projectId,
    userId: session.user.id,
    input: body,
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
