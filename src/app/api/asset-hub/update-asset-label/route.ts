import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

/**
 * POST /api/asset-hub/update-asset-label
 * 资产中心不再支持图片黑边标识更新
 */
export const POST = apiHandler(async (request: NextRequest) => {
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const result = await executeProjectAgentOperationFromApi({
        request,
        operationId: 'api_asset_hub_update_asset_label_disabled',
        projectId: 'global-asset-hub',
        userId: authResult.session.user.id,
        input: {},
        source: 'asset-hub',
    })

    return NextResponse.json(result)
})
