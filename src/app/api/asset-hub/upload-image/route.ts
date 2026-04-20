import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

/**
 * POST /api/asset-hub/upload-image
 * 上传用户自定义图片作为角色或场景资产
 */
export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'api_asset_hub_upload_image',
    projectId: 'global-asset-hub',
    userId: authResult.session.user.id,
    input: {},
    source: 'asset-hub',
  })

  return NextResponse.json(result)
})

