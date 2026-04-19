import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuth } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const episodeId = request.nextUrl.searchParams.get('episodeId')?.trim() || null
  const currentStage = request.nextUrl.searchParams.get('currentStage')?.trim() || null
  const scopeRef = request.nextUrl.searchParams.get('scopeRef')?.trim() || null

  const projectContext = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'get_project_context',
    projectId,
    userId: authResult.session.user.id,
    context: {
      episodeId,
      currentStage,
    },
    input: {
      detail: 'full',
      ...(scopeRef ? { selectedScopeRef: scopeRef } : {}),
    },
    source: 'project-ui',
  })

  return NextResponse.json({
    context: projectContext,
  })
})
