/**
 * 批量创建剧集 API
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const POST = apiHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult
    const body = await request.json().catch(() => ({}))
    const result = await executeProjectAgentOperationFromApi({
        request,
        operationId: 'batch_create_episodes',
        projectId,
        userId: authResult.session.user.id,
        input: body,
        source: 'project-ui',
    })

    return NextResponse.json(result)
})
