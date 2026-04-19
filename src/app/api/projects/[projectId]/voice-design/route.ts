import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const voicePrompt = typeof body.voicePrompt === 'string' ? body.voicePrompt.trim() : ''
  const previewText = typeof body.previewText === 'string' ? body.previewText.trim() : ''
  const preferredName = typeof body.preferredName === 'string' && body.preferredName.trim()
    ? body.preferredName.trim()
    : undefined
  const language = body.language === 'en' ? 'en' : 'zh'

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'voice_design',
    projectId,
    userId: authResult.session.user.id,
    input: {
      voicePrompt,
      previewText,
      ...(preferredName ? { preferredName } : {}),
      language,
    },
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
