import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

/**
 * GET /api/projects/[projectId]/editor
 * 获取剧集的编辑器项目数据
 */
export const GET = apiHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const episodeId = request.nextUrl.searchParams.get('episodeId')

    if (!episodeId) {
        throw new ApiError('INVALID_PARAMS')
    }

    // 查找编辑器项目
    const editorProject = await prisma.videoEditorProject.findUnique({
        where: { episodeId }
    })

    if (!editorProject) {
        return NextResponse.json({ projectData: null }, { status: 200 })
    }

    return NextResponse.json({
        id: editorProject.id,
        episodeId: editorProject.episodeId,
        projectData: JSON.parse(editorProject.projectData),
        renderStatus: editorProject.renderStatus,
        outputUrl: editorProject.outputUrl,
        updatedAt: editorProject.updatedAt
    })
})

/**
 * PUT /api/projects/[projectId]/editor
 * 保存编辑器项目数据
 */
export const PUT = apiHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const body = await request.json()
    const { episodeId, projectData } = body

    if (!episodeId || !projectData) {
        throw new ApiError('INVALID_PARAMS')
    }

    const result = await executeProjectAgentOperationFromApi({
        request,
        operationId: 'save_video_editor_project',
        projectId,
        userId: authResult.session.user.id,
        input: {
            episodeId,
            projectData,
        },
        source: 'project-ui',
    })

    return NextResponse.json(result)
})

/**
 * DELETE /api/projects/[projectId]/editor
 * 删除编辑器项目
 */
export const DELETE = apiHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const episodeId = request.nextUrl.searchParams.get('episodeId')

    if (!episodeId) {
        throw new ApiError('INVALID_PARAMS')
    }

    await executeProjectAgentOperationFromApi({
        request,
        operationId: 'delete_video_editor_project',
        projectId,
        userId: authResult.session.user.id,
        input: {
            episodeId,
        },
        source: 'project-ui',
    })

    return NextResponse.json({ success: true })
})
