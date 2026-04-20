import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

/**
 * POST /api/asset-hub/upload-temp
 * 上传临时文件（Base64），返回签名 URL
 * 支持图片和音频格式
 */
export const POST = apiHandler(async (request: NextRequest) => {
    // 🔐 统一权限验证
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
        operationId: 'api_asset_hub_upload_temp',
        projectId: 'global-asset-hub',
        userId: authResult.session.user.id,
        input: body,
        source: 'asset-hub',
    })

    return NextResponse.json(result)
})
