import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

/**
 * PATCH /api/projects/[projectId]/character-voice
 * 更新角色的配音音色设置
 * Body: { characterId, voiceType, voiceId, customVoiceUrl }
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
  const { characterId, voiceType, voiceId, customVoiceUrl } = body

  if (!characterId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'patch_character_voice',
    projectId,
    userId: authResult.session.user.id,
    input: {
      characterId,
      ...(voiceType !== undefined ? { voiceType } : {}),
      ...(voiceId !== undefined ? { voiceId } : {}),
      ...(customVoiceUrl !== undefined ? { customVoiceUrl } : {}),
    },
    source: 'project-ui',
  })

  return NextResponse.json(result)
})

/**
 * POST /api/projects/[projectId]/character-voice
 * 上传自定义音色音频 或 保存 AI 设计的声音
 * FormData: { characterId, file } - 文件上传
 * JSON: { characterId, voiceDesign: { voiceId, audioBase64 } } - AI 声音设计
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const contentType = request.headers.get('content-type') || ''

  // 处理 JSON 请求（AI 声音设计）
  if (contentType.includes('application/json')) {
    const body = await request.json()
    const { characterId, voiceDesign } = body

    if (!characterId || !voiceDesign) {
      throw new ApiError('INVALID_PARAMS')
    }

    const { voiceId, audioBase64 } = voiceDesign
    if (!voiceId || !audioBase64) {
      throw new ApiError('INVALID_PARAMS')
    }

    const result = await executeProjectAgentOperationFromApi({
      request,
      operationId: 'upload_character_voice_audio',
      projectId,
      userId: authResult.session.user.id,
      input: {
        characterId,
        voiceId,
        voiceType: 'qwen-designed',
        audioBase64,
        ext: 'wav',
      },
      source: 'project-ui',
    })

    return NextResponse.json(result)
  }

  // 处理 FormData 请求（文件上传）
  const formData = await request.formData()
  const file = formData.get('file') as File
  const characterId = formData.get('characterId') as string

  if (!file || !characterId) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 验证文件类型
  const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/x-m4a']
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|m4a)$/i)) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 读取文件
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // 获取文件扩展名
  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3'

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'upload_character_voice_audio',
    projectId,
    userId: authResult.session.user.id,
    input: {
      characterId,
      voiceType: 'uploaded',
      audioBase64: buffer.toString('base64'),
      ext,
    },
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
