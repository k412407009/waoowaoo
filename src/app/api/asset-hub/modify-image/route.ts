import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

type LegacyModifyBody = Record<string, unknown> & {
  type?: 'character' | 'location'
  id?: string
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json() as LegacyModifyBody
  if ((body.type !== 'character' && body.type !== 'location') || typeof body.id !== 'string' || body.id.trim().length === 0) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'api_asset_hub_modify_image',
    projectId: 'global-asset-hub',
    userId: authResult.session.user.id,
    input: body,
    source: 'asset-hub',
  })

  return NextResponse.json(result)
})
