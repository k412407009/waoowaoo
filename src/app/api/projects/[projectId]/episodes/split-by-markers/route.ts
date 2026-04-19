import { logInfo as _ulogInfo } from '@/lib/logging/core'
/**
 * 标识符分集 API
 * 根据检测到的分集标记直接切割文本，不调用 AI
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logUserAction } from '@/lib/logging/semantic'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const POST = apiHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) => {
    _ulogInfo('[Split-By-Markers API] ========== 开始处理请求 ==========')

    const { projectId } = await params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult
    const session = authResult.session

    const userId = session.user.id
    const username = session.user.name || session.user.email || 'unknown'
    const { content } = await request.json()

    if (!content || typeof content !== 'string') {
        throw new ApiError('INVALID_PARAMS')
    }

    if (content.length < 100) {
        throw new ApiError('INVALID_PARAMS')
    }

    // 验证项目存在
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true }
    })

    if (!project) {
        throw new ApiError('NOT_FOUND')
    }

    const projectName = project.name || projectId

    const result = await executeProjectAgentOperationFromApi({
        request,
        operationId: 'split_episodes_by_markers',
        projectId,
        userId,
        input: { content },
        source: 'project-ui',
    }) as {
        success: boolean
        method: string
        markerType: string
        confidence: number
        episodes: Array<{ title: string; content: string; wordCount: number }>
    }

    // 记录日志
    logUserAction(
        'EPISODE_SPLIT_BY_MARKERS',
        userId,
        username,
        `标识符分集完成 - ${result.episodes.length} 集，标记类型: ${result.markerType}`,
        {
            markerType: result.markerType,
            confidence: result.confidence,
            episodeCount: result.episodes.length,
            totalWords: result.episodes.reduce((sum, ep) => sum + ep.wordCount, 0)
        },
        projectId,
        projectName
    )

    return NextResponse.json({
        ...result
    })
})
