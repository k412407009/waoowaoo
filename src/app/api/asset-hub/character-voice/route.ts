import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

/**
 * POST /api/asset-hub/character-voice
 * 上传自定义音色音频（JSON 或 multipart/form-data）
 */
export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'api_asset_hub_character_voice_post',
    projectId: 'global-asset-hub',
    userId: authResult.session.user.id,
    input: {},
    source: 'asset-hub',
  })

  return NextResponse.json(result)
})

/**
 * PATCH /api/asset-hub/character-voice
 * 更新角色音色设置
 */
export const PATCH = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'api_asset_hub_character_voice_patch',
    projectId: 'global-asset-hub',
    userId: authResult.session.user.id,
    input: body,
    source: 'asset-hub',
  })

  return NextResponse.json(result)
})

