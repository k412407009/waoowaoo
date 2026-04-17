import { prisma } from '@/lib/prisma'
import { revertAssetRender } from '@/lib/assets/services/asset-actions'

export type MutationRevertResult = {
  ok: true
  reverted: number
} | {
  ok: false
  reverted: number
  error: string
}

async function rollbackCreatedVariantPanel(params: {
  panelId: string
  storyboardId: string
  panelIndex: number
}) {
  await prisma.$transaction(async (tx) => {
    await tx.projectPanel.delete({
      where: { id: params.panelId },
    })

    const maxPanel = await tx.projectPanel.findFirst({
      where: { storyboardId: params.storyboardId },
      orderBy: { panelIndex: 'desc' },
      select: { panelIndex: true },
    })
    const maxPanelIndex = maxPanel?.panelIndex ?? -1
    const offset = maxPanelIndex + 1000

    await tx.projectPanel.updateMany({
      where: {
        storyboardId: params.storyboardId,
        panelIndex: { gt: params.panelIndex },
      },
      data: {
        panelIndex: { increment: offset },
        panelNumber: { increment: offset },
      },
    })

    await tx.projectPanel.updateMany({
      where: {
        storyboardId: params.storyboardId,
        panelIndex: { gt: params.panelIndex + offset },
      },
      data: {
        panelIndex: { decrement: offset + 1 },
        panelNumber: { decrement: offset + 1 },
      },
    })

    const panelCount = await tx.projectPanel.count({
      where: { storyboardId: params.storyboardId },
    })

    await tx.projectStoryboard.update({
      where: { id: params.storyboardId },
      data: { panelCount },
    })
  })
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function revertMutationEntry(entry: {
  kind: string
  targetType: string
  targetId: string
  payload: unknown
  projectId: string
  userId: string
}): Promise<void> {
  const payload = asRecord(entry.payload)

  switch (entry.kind) {
    case 'asset_render_revert': {
      const kind = readString(payload.kind)
      const assetId = readString(payload.assetId) || entry.targetId
      const appearanceId = readString(payload.appearanceId)
      if (kind !== 'character' && kind !== 'location') {
        throw new Error('MUTATION_UNSUPPORTED_KIND')
      }
      await revertAssetRender({
        kind,
        assetId,
        body: {
          ...(appearanceId ? { appearanceId } : {}),
        },
        access: {
          scope: 'project',
          userId: entry.userId,
          projectId: entry.projectId,
        },
      })
      return
    }
    case 'panel_candidate_cancel': {
      const panelId = entry.targetId
      await prisma.projectPanel.update({
        where: { id: panelId },
        data: {
          candidateImages: null,
          previousImageUrl: null,
        },
      })
      return
    }
    case 'panel_variant_delete': {
      const storyboardId = readString(payload.storyboardId)
      const panelIndex = Number(payload.panelIndex)
      if (!storyboardId || !Number.isFinite(panelIndex)) {
        throw new Error('MUTATION_VARIANT_PAYLOAD_INVALID')
      }
      await rollbackCreatedVariantPanel({
        panelId: entry.targetId,
        storyboardId,
        panelIndex,
      })
      return
    }
    case 'panel_prompt_restore': {
      const previousVideoPrompt = payload.previousVideoPrompt === null || typeof payload.previousVideoPrompt === 'string'
        ? payload.previousVideoPrompt
        : undefined
      const previousFirstLastFramePrompt = payload.previousFirstLastFramePrompt === null || typeof payload.previousFirstLastFramePrompt === 'string'
        ? payload.previousFirstLastFramePrompt
        : undefined
      const previousImagePrompt = payload.previousImagePrompt === null || typeof payload.previousImagePrompt === 'string'
        ? payload.previousImagePrompt
        : undefined

      await prisma.projectPanel.update({
        where: { id: entry.targetId },
        data: {
          ...(previousVideoPrompt !== undefined ? { videoPrompt: previousVideoPrompt } : {}),
          ...(previousFirstLastFramePrompt !== undefined ? { firstLastFramePrompt: previousFirstLastFramePrompt } : {}),
          ...(previousImagePrompt !== undefined ? { imagePrompt: previousImagePrompt } : {}),
        },
      })
      return
    }
    case 'panel_reorder_restore': {
      const storyboardId = readString(payload.storyboardId)
      const panels = Array.isArray(payload.panels) ? payload.panels : []
      if (!storyboardId || panels.length === 0) {
        throw new Error('MUTATION_REORDER_PAYLOAD_INVALID')
      }

      await prisma.$transaction(async (tx) => {
        for (const panel of panels) {
          const id = readString((panel as Record<string, unknown>).id)
          const panelIndex = Number((panel as Record<string, unknown>).panelIndex)
          if (!id || !Number.isFinite(panelIndex)) continue
          await tx.projectPanel.update({
            where: { id },
            data: { panelIndex: -(panelIndex + 1) },
          })
        }
        for (const panel of panels) {
          const id = readString((panel as Record<string, unknown>).id)
          const panelIndex = Number((panel as Record<string, unknown>).panelIndex)
          const panelNumberRaw = (panel as Record<string, unknown>).panelNumber
          const panelNumber = panelNumberRaw === null || panelNumberRaw === undefined ? null : Number(panelNumberRaw)
          if (!id || !Number.isFinite(panelIndex)) continue
          await tx.projectPanel.update({
            where: { id },
            data: {
              panelIndex,
              panelNumber: Number.isFinite(panelNumber as number) ? panelNumber : null,
            },
          })
        }
      })
      return
    }
    case 'insert_panel_undo': {
      const taskId = readString(payload.taskId)
      if (!taskId) {
        throw new Error('MUTATION_INSERT_PANEL_TASK_REQUIRED')
      }
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { status: true, result: true },
      })
      if (!task) {
        throw new Error('MUTATION_TASK_NOT_FOUND')
      }
      if (!task.result || typeof task.result !== 'object' || Array.isArray(task.result)) {
        throw new Error('MUTATION_TASK_RESULT_MISSING')
      }
      const result = task.result as Record<string, unknown>
      const storyboardId = readString(result.storyboardId) || readString(payload.storyboardId) || entry.targetId
      const panelId = readString(result.panelId)
      const panelIndex = Number(result.panelIndex)
      if (!storyboardId || !panelId || !Number.isFinite(panelIndex)) {
        throw new Error('MUTATION_TASK_RESULT_INVALID')
      }
      await rollbackCreatedVariantPanel({
        panelId,
        storyboardId,
        panelIndex,
      })
      return
    }
    case 'voice_line_restore': {
      const previousAudioUrl = payload.previousAudioUrl === null || typeof payload.previousAudioUrl === 'string'
        ? payload.previousAudioUrl
        : null
      await prisma.projectVoiceLine.update({
        where: { id: entry.targetId },
        data: {
          audioUrl: previousAudioUrl,
        },
      })
      return
    }
    case 'panel_video_restore': {
      const previousVideoUrl = payload.previousVideoUrl === null || typeof payload.previousVideoUrl === 'string'
        ? payload.previousVideoUrl
        : null
      await prisma.projectPanel.update({
        where: { id: entry.targetId },
        data: {
          videoUrl: previousVideoUrl,
        },
      })
      return
    }
    case 'panel_lipsync_restore': {
      const previousLipSyncVideoUrl = payload.previousLipSyncVideoUrl === null || typeof payload.previousLipSyncVideoUrl === 'string'
        ? payload.previousLipSyncVideoUrl
        : null
      await prisma.projectPanel.update({
        where: { id: entry.targetId },
        data: {
          lipSyncVideoUrl: previousLipSyncVideoUrl,
        },
      })
      return
    }
    default:
      throw new Error(`MUTATION_KIND_UNSUPPORTED:${entry.kind}`)
  }
}

export async function revertMutationBatch(params: {
  batchId: string
  projectId: string
  userId: string
}): Promise<MutationRevertResult> {
  const batch = await prisma.mutationBatch.findFirst({
    where: {
      id: params.batchId,
      projectId: params.projectId,
      userId: params.userId,
    },
    include: {
      entries: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!batch) {
    return { ok: false, reverted: 0, error: 'MUTATION_BATCH_NOT_FOUND' }
  }

  if (batch.status === 'reverted') {
    return { ok: true, reverted: 0 }
  }

  let reverted = 0
  try {
    for (const entry of batch.entries) {
      await revertMutationEntry({
        kind: entry.kind,
        targetType: entry.targetType,
        targetId: entry.targetId,
        payload: entry.payload,
        projectId: params.projectId,
        userId: params.userId,
      })
      reverted += 1
    }
    await prisma.mutationBatch.update({
      where: { id: batch.id },
      data: { status: 'reverted', revertedAt: new Date(), revertError: null },
    })
    return { ok: true, reverted }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await prisma.mutationBatch.update({
      where: { id: batch.id },
      data: { status: 'failed', revertError: message },
    })
    return { ok: false, reverted, error: message }
  }
}
