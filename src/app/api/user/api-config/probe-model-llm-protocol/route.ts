import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

type ProbeRequestBody = {
  providerId?: unknown
  modelId?: unknown
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  let body: ProbeRequestBody
  try {
    body = (await request.json()) as ProbeRequestBody
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: 'BODY_PARSE_FAILED',
      field: 'body',
    })
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'api_user_api_config_probe_model_llm_protocol',
    projectId: 'system',
    userId: authResult.session.user.id,
    input: body,
    source: 'api-config',
  })

  return NextResponse.json(result)
})
