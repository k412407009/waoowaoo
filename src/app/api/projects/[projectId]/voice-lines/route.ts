import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

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
    const result = await executeProjectAgentOperationFromApi({
      request,
      operationId: 'list_voice_line_speakers',
      projectId,
      userId: authResult.session.user.id,
      input: {},
      source: 'project-ui',
    })

    return NextResponse.json(result)
  }

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'list_voice_lines',
    projectId,
    userId: authResult.session.user.id,
    input: { episodeId },
    source: 'project-ui',
  })

  return NextResponse.json(result)
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
