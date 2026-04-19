import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { resolveMediaRef } from '@/lib/media/service'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

async function resolveMatchedPanelData(
  matchedPanelId: string | null | undefined,
  expectedEpisodeId?: string
) {
  if (matchedPanelId === undefined) {
    return null
  }

  if (matchedPanelId === null) {
    return {
      matchedPanelId: null,
      matchedStoryboardId: null,
      matchedPanelIndex: null
    }
  }

  const panel = await prisma.projectPanel.findUnique({
    where: { id: matchedPanelId },
    select: {
      id: true,
      storyboardId: true,
      panelIndex: true,
      storyboard: {
        select: {
          episodeId: true
        }
      }
    }
  })

  if (!panel) {
    throw new ApiError('NOT_FOUND')
  }
  if (expectedEpisodeId && panel.storyboard.episodeId !== expectedEpisodeId) {
    throw new ApiError('INVALID_PARAMS')
  }

  return {
    matchedPanelId: panel.id,
    matchedStoryboardId: panel.storyboardId,
    matchedPanelIndex: panel.panelIndex
  }
}

async function withVoiceLineMedia<T extends Record<string, unknown>>(line: T) {
  const audioMedia = await resolveMediaRef(line.audioMediaId, line.audioUrl)
  const matchedPanel = line.matchedPanel as
    | {
      storyboardId?: string | null
      panelIndex?: number | null
    }
    | null
    | undefined
  return {
    ...line,
    media: audioMedia,
    audioMedia,
    audioUrl: audioMedia?.url || line.audioUrl || null,
    updatedAt:
      line.updatedAt instanceof Date
        ? line.updatedAt.toISOString()
        : typeof line.updatedAt === 'string'
          ? line.updatedAt
          : null,
    matchedStoryboardId: matchedPanel?.storyboardId ?? line.matchedStoryboardId,
    matchedPanelIndex: matchedPanel?.panelIndex ?? line.matchedPanelIndex}
}

/**
 * GET /api/projects/[projectId]/voice-lines?episodeId=xxx
 * 获取剧集的台词列表
 */
export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const episodeId = searchParams.get('episodeId')
  const speakersOnly = searchParams.get('speakersOnly')

  if (speakersOnly === '1') {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true }
    })
    if (!project) {
      throw new ApiError('NOT_FOUND')
    }

    const speakerRows = await prisma.projectVoiceLine.findMany({
      where: {
        episode: {
          projectId
        }
      },
      select: { speaker: true },
      distinct: ['speaker'],
      orderBy: { speaker: 'asc' }
    })

    return NextResponse.json({
      speakers: speakerRows.map(item => item.speaker).filter(Boolean)
    })
  }

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 获取台词列表（包含匹配的 Panel 信息）
  const voiceLines = await prisma.projectVoiceLine.findMany({
    where: { episodeId },
    orderBy: { lineIndex: 'asc' },
    include: {
      matchedPanel: {
        select: {
          id: true,
          storyboardId: true,
          panelIndex: true
        }
      }
    }
  })

  // 转换为稳定媒体 URL，并添加兼容字段
  const voiceLinesWithUrls = await Promise.all(voiceLines.map(withVoiceLineMedia))

  // 统计发言人
  const speakerStats: Record<string, number> = {}
  for (const line of voiceLines) {
    speakerStats[line.speaker] = (speakerStats[line.speaker] || 0) + 1
  }

  return NextResponse.json({
    voiceLines: voiceLinesWithUrls,
    count: voiceLines.length,
    speakerStats
  })
})

/**
 * POST /api/projects/[projectId]/voice-lines
 * 新增单条台词
 * Body: { episodeId, content, speaker, matchedPanelId?: string | null }
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { episodeId, content, speaker, matchedPanelId } = body

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS')
  }
  if (!content || !content.trim()) {
    throw new ApiError('INVALID_PARAMS')
  }
  if (!speaker || !speaker.trim()) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'create_voice_line',
    projectId,
    userId: authResult.session.user.id,
    input: {
      episodeId,
      content,
      speaker,
      ...(matchedPanelId !== undefined ? { matchedPanelId } : {}),
    },
    source: 'project-ui',
  })

  return NextResponse.json(result)
})

/**
 * PATCH /api/projects/[projectId]/voice-lines
 * 更新台词设置（内容、发言人、情绪设置、音频URL）
 * Body: { lineId, content, speaker, emotionPrompt, emotionStrength, audioUrl } 
 *    或 { speaker, episodeId, voicePresetId } (批量更新同一发言人的音色)
 */
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const {
    lineId,
    speaker,
    episodeId,
    voicePresetId,
    emotionPrompt,
    emotionStrength,
    content,
    audioUrl,
    matchedPanelId
  } = body

  // 单条更新
  if (lineId) {
    const result = await executeProjectAgentOperationFromApi({
      request,
      operationId: 'update_voice_line',
      projectId,
      userId: authResult.session.user.id,
      input: {
        lineId,
        ...(voicePresetId !== undefined ? { voicePresetId } : {}),
        ...(emotionPrompt !== undefined ? { emotionPrompt } : {}),
        ...(emotionStrength !== undefined ? { emotionStrength } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(speaker !== undefined ? { speaker } : {}),
        ...(audioUrl !== undefined ? { audioUrl } : {}),
        ...(matchedPanelId !== undefined ? { matchedPanelId } : {}),
      },
      source: 'project-ui',
    })
    return NextResponse.json(result)
  }

  // 批量更新同一发言人（仅支持更新音色）
  if (speaker && episodeId) {
    const result = await executeProjectAgentOperationFromApi({
      request,
      operationId: 'bulk_update_speaker_voice_preset',
      projectId,
      userId: authResult.session.user.id,
      input: {
        episodeId,
        speaker,
        voicePresetId,
      },
      source: 'project-ui',
    })
    return NextResponse.json(result)
  }

  throw new ApiError('INVALID_PARAMS')
})

/**
 * DELETE /api/projects/[projectId]/voice-lines?lineId=xxx
 * 删除单条台词
 */
export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const lineId = searchParams.get('lineId')

  if (!lineId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'delete_voice_line',
    projectId,
    userId: authResult.session.user.id,
    input: {
      lineId,
    },
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
