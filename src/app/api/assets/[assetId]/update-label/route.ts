import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuth, requireUserAuth } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'
import type { AssetKind, AssetScope } from '@/lib/assets/contracts'

type UpdateLabelBody = {
  scope?: AssetScope
  kind?: AssetKind
  projectId?: string
  newName?: string
}

function isUpdatableKind(value: AssetKind | undefined): value is Extract<AssetKind, 'character' | 'location' | 'prop'> {
  return value === 'character' || value === 'location' || value === 'prop'
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ assetId: string }> },
) => {
  const { assetId } = await context.params
  const body = await request.json() as UpdateLabelBody

  if (!body.scope || !body.newName || !isUpdatableKind(body.kind)) {
    throw new ApiError('INVALID_PARAMS')
  }

  if (body.scope === 'project') {
    if (!body.projectId) {
      throw new ApiError('INVALID_PARAMS', { details: 'projectId is required for project scope' })
    }
    const authResult = await requireProjectAuth(body.projectId)
    if (isErrorResponse(authResult)) return authResult
    const result = await executeProjectAgentOperationFromApi({
      request,
      operationId: 'api_assets_update_label',
      projectId: body.projectId,
      userId: authResult.session.user.id,
      input: { assetId, ...body },
      source: 'project-ui',
    })
    return NextResponse.json(result)
  } else {
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const result = await executeProjectAgentOperationFromApi({
      request,
      operationId: 'api_assets_update_label',
      projectId: 'global-asset-hub',
      userId: authResult.session.user.id,
      input: { assetId, ...body },
      source: 'project-ui',
    })
    return NextResponse.json(result)
  }
})
