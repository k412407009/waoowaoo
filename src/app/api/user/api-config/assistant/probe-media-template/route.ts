import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

type RequestBody = {
  providerId?: unknown
  modelId?: unknown
  template?: unknown
  samplePrompt?: unknown
  sampleImage?: unknown
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: 'BODY_PARSE_FAILED',
      field: 'body',
    })
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'api_user_api_config_probe_media_template',
    projectId: 'system',
    userId: authResult.session.user.id,
    input: body,
    source: 'api-config',
  })

  return NextResponse.json(result)
})
