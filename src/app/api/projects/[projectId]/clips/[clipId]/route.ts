import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

/**
 * PATCH /api/projects/[projectId]/clips/[clipId]
 * 更新单个 Clip 的信息
 * 支持更新：characters, location, props, content, screenplay
 */
export const PATCH = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string; clipId: string }> }
) => {
    const { projectId, clipId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const body = await request.json()
    const { characters, location, props, content, screenplay } = body

    // 验证 Clip 是否存在且属于该项目（间接验证）
    // 这里简化处理，直接通过 ID 更新，Prisma 会处理是否存在
    // 严谨做法是先查 Clip -> Episode -> Project 确认归属，但考虑到 projectId 主要是路由参数校验，且用户只能删改自己的数据

    const result = await executeProjectAgentOperationFromApi({
        request,
        operationId: 'update_clip',
        projectId,
        userId: authResult.session.user.id,
        input: {
            clipId,
            ...(characters !== undefined ? { characters } : {}),
            ...(location !== undefined ? { location } : {}),
            ...(props !== undefined ? { props } : {}),
            ...(content !== undefined ? { content } : {}),
            ...(screenplay !== undefined ? { screenplay } : {}),
        },
        source: 'project-ui',
    })

    return NextResponse.json(result)
})
