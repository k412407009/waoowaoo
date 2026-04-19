import { logError as _ulogError } from '@/lib/logging/core'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { attachMediaFieldsToProject } from '@/lib/media/attach'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

/**
 * GET - 获取单个剧集的完整数据
 */
export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> }
) => {
  const { projectId, episodeId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  // 获取剧集及其关联数据
  const episode = await prisma.projectEpisode.findUnique({
    where: { id: episodeId },
    include: {
      clips: {
        orderBy: { createdAt: 'asc' }
      },
      storyboards: {
        include: {
          clip: true,
          panels: { orderBy: { panelIndex: 'asc' } }
        },
        orderBy: { createdAt: 'asc' }
      },
      shots: {
        orderBy: { shotId: 'asc' }
      },
      voiceLines: {
        orderBy: { lineIndex: 'asc' }
      }
    }
  })

  if (!episode) {
    throw new ApiError('NOT_FOUND')
  }

  // 更新最后编辑的剧集ID（异步，不阻塞响应）
  prisma.project.update({
    where: { id: projectId },
    data: { lastEpisodeId: episodeId }
  }).catch(err => _ulogError('更新 lastEpisodeId 失败:', err))

  // 转换为稳定媒体 URL（并保留兼容字段）
  const episodeWithSignedUrls = await attachMediaFieldsToProject(episode)

  return NextResponse.json({ episode: episodeWithSignedUrls })
})

/**
 * PATCH - 更新剧集信息
 */
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> }
) => {
  const { projectId, episodeId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { name, description, novelText, audioUrl, srtContent } = body

  const episode = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'update_episode',
    projectId,
    userId: authResult.session.user.id,
    input: {
      episodeId,
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(novelText !== undefined ? { novelText } : {}),
      ...(audioUrl !== undefined ? { audioUrl } : {}),
      ...(srtContent !== undefined ? { srtContent } : {}),
    },
    source: 'project-ui',
  })

  return NextResponse.json({ episode })
})

/**
 * DELETE - 删除剧集
 */
export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> }
) => {
  const { projectId, episodeId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  await executeProjectAgentOperationFromApi({
    request,
    operationId: 'delete_episode',
    projectId,
    userId: authResult.session.user.id,
    input: {
      episodeId,
    },
    source: 'project-ui',
  })

  return NextResponse.json({ success: true })
})
