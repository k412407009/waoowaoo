import { NextRequest } from 'next/server'
import archiver from 'archiver'
import { getObjectBuffer } from '@/lib/storage'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: 'BODY_PARSE_FAILED',
      field: 'body',
      message: 'request body must be valid JSON',
    })
  }

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const plan = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'list_download_videos',
    projectId,
    userId: authResult.session.user.id,
    input: body,
    source: 'project-ui',
  })

  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new ApiError('EXTERNAL_ERROR', {
      code: 'DOWNLOAD_PLAN_INVALID',
      message: 'list_download_videos returned invalid payload',
    })
  }

  const projectName = typeof (plan as { projectName?: unknown }).projectName === 'string'
    ? (plan as { projectName: string }).projectName
    : ''
  const files = Array.isArray((plan as { files?: unknown }).files)
    ? (plan as { files: Array<{ fileName?: unknown; storageKey?: unknown }> }).files
    : null

  if (!projectName || !files) {
    throw new ApiError('EXTERNAL_ERROR', {
      code: 'DOWNLOAD_PLAN_INVALID',
      message: 'download plan missing projectName/files',
    })
  }

  const archive = archiver('zip', { zlib: { level: 9 } })
  const archiveFinished = new Promise<void>((resolve, reject) => {
    archive.on('end', () => resolve())
    archive.on('error', (err) => reject(err))
  })

  const chunks: Uint8Array[] = []
  archive.on('data', (chunk) => {
    chunks.push(chunk)
  })

  for (const file of files) {
    const fileName = typeof file.fileName === 'string' ? file.fileName : ''
    const storageKey = typeof file.storageKey === 'string' ? file.storageKey : ''
    if (!fileName || !storageKey) {
      throw new ApiError('EXTERNAL_ERROR', {
        code: 'DOWNLOAD_PLAN_INVALID',
        message: 'download file missing fileName/storageKey',
      })
    }

    const videoData = await getObjectBuffer(storageKey)
    archive.append(videoData, { name: fileName })
  }

  await archive.finalize()
  await archiveFinished

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }

  return new Response(result, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(projectName)}_videos.zip"`,
    },
  })
})

