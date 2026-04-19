import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

/**
 * POST /api/projects/[projectId]/panel/select-candidate
 * 统一的候选图片操作 API
 * 
 * action: 'select' - 选择候选图片作为最终图片
 * action: 'cancel' - 取消选择，清空候选列表
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const panelId = typeof body.panelId === 'string' ? body.panelId.trim() : ''
  const selectedImageUrl = typeof body.selectedImageUrl === 'string' ? body.selectedImageUrl.trim() : ''
  const action = body.action === 'cancel' ? 'cancel' : 'select'

  if (!panelId) {
    throw new ApiError('INVALID_PARAMS')
  }

  // === 取消操作 ===
  if (action === 'cancel') {
    const panel = await prisma.projectPanel.findUnique({
      where: { id: panelId },
      select: { storyboardId: true },
    })
    if (!panel) throw new ApiError('NOT_FOUND')
    await executeProjectAgentOperationFromApi({
      request,
      operationId: 'mutate_storyboard',
      projectId,
      userId: authResult.session.user.id,
      input: {
        action: 'cancel_panel_candidates',
        storyboardId: panel.storyboardId,
        panelId,
      },
      source: 'project-ui',
    })

    return NextResponse.json({
      success: true,
      message: '已取消选择'
    })
  }

  // === 选择操作 ===
  if (!selectedImageUrl) {
    throw new ApiError('INVALID_PARAMS')
  }

  const panel = await prisma.projectPanel.findUnique({
    where: { id: panelId },
    select: { storyboardId: true },
  })
  if (!panel) throw new ApiError('NOT_FOUND')

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'mutate_storyboard',
    projectId,
    userId: authResult.session.user.id,
    input: {
      action: 'select_panel_candidate',
      storyboardId: panel.storyboardId,
      panelId,
      selectedImageUrl,
    },
    source: 'project-ui',
  })

  const imageUrl = (result && typeof result === 'object' && !Array.isArray(result) && 'imageUrl' in result)
    ? (result as { imageUrl?: unknown }).imageUrl
    : null

  return NextResponse.json({
    success: true,
    imageUrl,
    message: '已选择图片'
  })
})
