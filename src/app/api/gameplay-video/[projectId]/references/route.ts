import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import {
  createGameplayReferences,
  deleteGameplayReference,
  loadGameplayVideoProject,
} from '@/lib/gameplay-video/service'

type ReferenceInput = {
  kind: string
  title?: string | null
  imageUrl?: string | null
  notes?: string | null
  imageMediaId?: string | null
}

export const GET = apiHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const gameplayVideoData = await loadGameplayVideoProject(projectId)
  return NextResponse.json({
    references: gameplayVideoData.references,
  })
})

export const POST = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => null)
  const inputReferences = Array.isArray(body?.references)
    ? body.references
    : [body]

  const references = inputReferences
    .map((reference: unknown): ReferenceInput | null => {
      const record = (typeof reference === 'object' && reference !== null ? reference : {}) as Record<string, unknown>
      const kind = typeof record.kind === 'string' ? record.kind.trim() : ''
      const imageUrl = typeof record.imageUrl === 'string' ? record.imageUrl.trim() : ''
      if (!kind || (!imageUrl && typeof record.imageMediaId !== 'string')) {
        return null
      }

      return {
        kind,
        title: typeof record.title === 'string' ? record.title.trim() : null,
        imageUrl: imageUrl || null,
        notes: typeof record.notes === 'string' ? record.notes.trim() : null,
        imageMediaId: typeof record.imageMediaId === 'string' ? record.imageMediaId.trim() : null,
      }
    })
    .filter((reference: ReferenceInput | null): reference is ReferenceInput => !!reference)

  if (references.length === 0) {
    throw new ApiError('INVALID_PARAMS', {
      message: 'references are required',
    })
  }

  const gameplayVideoData = await createGameplayReferences({
    projectId,
    references,
  })

  return NextResponse.json({
    success: true,
    references: gameplayVideoData.references,
    gameplayVideoData,
  })
})

export const DELETE = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const referenceId = request.nextUrl.searchParams.get('referenceId')
  if (!referenceId) {
    throw new ApiError('INVALID_PARAMS', {
      message: 'referenceId is required',
    })
  }

  const gameplayVideoData = await deleteGameplayReference(projectId, referenceId)
  return NextResponse.json({
    success: true,
    references: gameplayVideoData.references,
    gameplayVideoData,
  })
})
