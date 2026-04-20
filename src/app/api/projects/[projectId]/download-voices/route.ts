import { NextRequest } from 'next/server'
import archiver from 'archiver'
import { getObjectBuffer } from '@/lib/storage'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params
  const { searchParams } = new URL(request.url)
  const episodeId = searchParams.get('episodeId')?.trim() || null

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const plan = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'list_download_voices',
    projectId,
    userId: authResult.session.user.id,
    input: episodeId ? { episodeId } : {},
    source: 'project-ui',
  })

  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new ApiError('EXTERNAL_ERROR', {
      code: 'DOWNLOAD_PLAN_INVALID',
      message: 'list_download_voices returned invalid payload',
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
  const stream = new ReadableStream({
    start(controller) {
      archive.on('data', (chunk) => controller.enqueue(chunk))
      archive.on('end', () => controller.close())
      archive.on('error', (err) => controller.error(err))

      void (async () => {
        for (const file of files) {
          const fileName = typeof file.fileName === 'string' ? file.fileName : ''
          const storageKey = typeof file.storageKey === 'string' ? file.storageKey : ''
          if (!fileName || !storageKey) {
            throw new ApiError('EXTERNAL_ERROR', {
              code: 'DOWNLOAD_PLAN_INVALID',
              message: 'download file missing fileName/storageKey',
            })
          }

          const audioData = await getObjectBuffer(storageKey)
          archive.append(audioData, { name: fileName })
        }

        await archive.finalize()
      })().catch((err) => controller.error(err))
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(projectName)}_voices.zip"`,
    },
  })
})

