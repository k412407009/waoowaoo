import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { reportTaskProgress } from '../shared'
import {
  assertTaskActive,
  resolveImageSourceFromGeneration,
  resolveVideoSourceFromGeneration,
  uploadImageSourceToCos,
  uploadVideoSourceToCos,
} from '../utils'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import type { GameplayBeatGenerationMode } from '@/types/gameplay-video'
import {
  buildGameplayKeyframePrompt,
  buildGameplayShotPrompt,
  buildGameplayUiOverlaySpec,
  generateGameplayBeatDrafts,
} from '@/lib/gameplay-video/pipeline'
import {
  loadGameplayVideoProject,
  normalizeEndSlateConfig,
  selectGameplayShot,
  syncGameplayEditorProject,
} from '@/lib/gameplay-video/service'
import { generateGameplayVoiceover } from '@/lib/gameplay-video/voiceover'
import { renderGameplayVideoToStorage } from '@/lib/gameplay-video/render'

type AnyObj = Record<string, unknown>

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function readPositiveNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  return fallback
}

function readGenerationMode(value: unknown, fallback: GameplayBeatGenerationMode): GameplayBeatGenerationMode {
  if (
    value === 'hybrid'
    || value === 'image-to-video'
    || value === 'text-to-video'
    || value === 'first-last-frame'
  ) {
    return value
  }
  return fallback
}

async function handleGameplayBeatsGenerateTask(job: Job<TaskJobData>) {
  const project = await loadGameplayVideoProject(job.data.projectId)
  if (!project.brief?.script.trim()) {
    throw new Error('GAMEPLAY_BRIEF_SCRIPT_REQUIRED')
  }

  await reportTaskProgress(job, 20, { stage: 'gameplay_generate_beats' })

  const drafts = generateGameplayBeatDrafts({
    script: project.brief.script,
    targetDurationSec: project.targetDurationSec,
    visualStyle: project.visualStyle,
    uiStyle: project.uiStyle,
    sellingPoints: project.brief.sellingPoints,
    cta: project.brief.cta,
    references: project.references,
  })

  await prisma.gameplayBeat.deleteMany({
    where: { gameplayVideoProjectId: project.id },
  })

  for (const draft of drafts) {
    await prisma.gameplayBeat.create({
      data: {
        gameplayVideoProjectId: project.id,
        orderIndex: draft.orderIndex,
        archetype: draft.archetype,
        intent: draft.intent,
        durationSec: draft.durationSec,
        camera: draft.camera,
        uiNeeds: JSON.stringify(draft.uiNeeds),
        subtitleText: draft.subtitleText,
        voiceoverText: draft.voiceoverText,
        generationMode: draft.generationMode,
        shotPrompt: draft.shotPrompt,
      },
    })
  }

  await syncGameplayEditorProject(job.data.projectId)

  return {
    beatCount: drafts.length,
  }
}

async function handleGameplayUiComposeTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const beatId = readString(payload.beatId) || job.data.targetId
  if (!beatId) throw new Error('GAMEPLAY_BEAT_ID_REQUIRED')

  const project = await loadGameplayVideoProject(job.data.projectId)
  const beat = project.beats.find((item) => item.id === beatId)
  if (!beat) throw new Error('Gameplay beat not found')

  await reportTaskProgress(job, 30, { stage: 'gameplay_ui_compose', beatId })

  const overlays = buildGameplayUiOverlaySpec({
    intent: beat.intent,
    uiNeeds: beat.uiNeeds,
    subtitleText: beat.subtitleText,
    archetype: beat.archetype,
    cta: project.brief?.cta,
  })

  await prisma.gameplayBeat.update({
    where: { id: beatId },
    data: {
      overlaySpec: JSON.stringify(overlays),
    },
  })

  if (beat.selectedShotId) {
    await prisma.gameplayShot.update({
      where: { id: beat.selectedShotId },
      data: {
        overlaySpec: JSON.stringify(overlays),
      },
    })
  }

  await syncGameplayEditorProject(job.data.projectId)

  return {
    beatId,
    overlayCount: overlays.length,
  }
}

async function handleGameplayKeyframeGenerateTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const beatId = readString(payload.beatId) || job.data.targetId
  if (!beatId) throw new Error('GAMEPLAY_BEAT_ID_REQUIRED')

  const project = await loadGameplayVideoProject(job.data.projectId)
  const beat = project.beats.find((item) => item.id === beatId)
  if (!beat) throw new Error('Gameplay beat not found')

  const imageModel = readString(payload.imageModel) || project.imageModel
  if (!imageModel) throw new Error('GAMEPLAY_IMAGE_MODEL_REQUIRED')

  const kinds = readStringArray(payload.kinds)
  const targetKinds = kinds.length > 0 ? kinds : ['first', 'last']
  const referenceImages = project.references
    .map((reference) => reference.imageUrl)
    .filter((value): value is string => !!value)

  const updatedKinds: string[] = []
  for (let index = 0; index < targetKinds.length; index += 1) {
    const rawKind = targetKinds[index]
    const kind = rawKind === 'middle' ? 'middle' : rawKind === 'last' ? 'last' : 'first'
    const prompt = buildGameplayKeyframePrompt({
      beatIntent: beat.intent,
      archetype: beat.archetype,
      camera: beat.camera,
      visualStyle: project.visualStyle,
      uiStyle: project.uiStyle,
      kind,
      references: project.references,
    })

    await reportTaskProgress(job, 35 + index * 20, {
      stage: 'gameplay_generate_keyframe',
      beatId,
      kind,
    })

    const generatedImage = await resolveImageSourceFromGeneration(job, {
      userId: job.data.userId,
      modelId: imageModel,
      prompt,
      options: {
        referenceImages,
        aspectRatio: project.aspectRatio,
      },
    })
    const imageStorageKey = await uploadImageSourceToCos(
      generatedImage,
      'gameplay-keyframe',
      `${beatId}-${kind}`,
    )

    await prisma.gameplayKeyframe.upsert({
      where: {
        beatId_kind: {
          beatId,
          kind,
        },
      },
      create: {
        beatId,
        kind,
        prompt,
        imageUrl: imageStorageKey,
        referenceIds: JSON.stringify(project.references.map((reference) => reference.id)),
      },
      update: {
        prompt,
        imageUrl: imageStorageKey,
        referenceIds: JSON.stringify(project.references.map((reference) => reference.id)),
        updatedAt: new Date(),
      },
    })

    updatedKinds.push(kind)
  }

  return {
    beatId,
    kinds: updatedKinds,
  }
}

async function resolveSeedImageForBeat(job: Job<TaskJobData>, params: {
  beatId: string
  imageModel: string
}) {
  const project = await loadGameplayVideoProject(job.data.projectId)
  const beat = project.beats.find((item) => item.id === params.beatId)
  if (!beat) throw new Error('Gameplay beat not found')

  const preferredKeyframe = beat.keyframes.find((keyframe) => keyframe.kind === 'first')
    || beat.keyframes.find((keyframe) => keyframe.kind === 'middle')
    || beat.keyframes[0]

  if (preferredKeyframe?.imageUrl) {
    return {
      project,
      beat,
      seedImageUrl: preferredKeyframe.imageUrl,
      lastFrameImageUrl: beat.keyframes.find((keyframe) => keyframe.kind === 'last')?.imageUrl || null,
    }
  }

  const prompt = buildGameplayKeyframePrompt({
    beatIntent: beat.intent,
    archetype: beat.archetype,
    camera: beat.camera,
    visualStyle: project.visualStyle,
    uiStyle: project.uiStyle,
    kind: 'first',
    references: project.references,
  })
  const referenceImages = project.references
    .map((reference) => reference.imageUrl)
    .filter((value): value is string => !!value)
  const generatedImage = await resolveImageSourceFromGeneration(job, {
    userId: job.data.userId,
    modelId: params.imageModel,
    prompt,
    options: {
      referenceImages,
      aspectRatio: project.aspectRatio,
    },
  })
  const imageStorageKey = await uploadImageSourceToCos(
    generatedImage,
    'gameplay-keyframe',
    `${params.beatId}-auto-first`,
  )

  await prisma.gameplayKeyframe.upsert({
    where: {
      beatId_kind: {
        beatId: params.beatId,
        kind: 'first',
      },
    },
    create: {
      beatId: params.beatId,
      kind: 'first',
      prompt,
      imageUrl: imageStorageKey,
      referenceIds: JSON.stringify(project.references.map((reference) => reference.id)),
    },
    update: {
      prompt,
      imageUrl: imageStorageKey,
      referenceIds: JSON.stringify(project.references.map((reference) => reference.id)),
      updatedAt: new Date(),
    },
  })

  return {
    project,
    beat,
    seedImageUrl: imageStorageKey,
    lastFrameImageUrl: beat.keyframes.find((keyframe) => keyframe.kind === 'last')?.imageUrl || null,
  }
}

async function handleGameplayShotGenerateTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const beatId = readString(payload.beatId) || job.data.targetId
  if (!beatId) throw new Error('GAMEPLAY_BEAT_ID_REQUIRED')

  const projectSnapshot = await loadGameplayVideoProject(job.data.projectId)
  const beatSnapshot = projectSnapshot.beats.find((item) => item.id === beatId)
  if (!beatSnapshot) throw new Error('Gameplay beat not found')

  const imageModel = readString(payload.imageModel) || projectSnapshot.imageModel
  const videoModel = readString(payload.videoModel) || projectSnapshot.videoModel
  if (!imageModel) throw new Error('GAMEPLAY_IMAGE_MODEL_REQUIRED')
  if (!videoModel) throw new Error('GAMEPLAY_VIDEO_MODEL_REQUIRED')

  const shotIds = readStringArray(payload.shotIds)
  const variantCount = shotIds.length > 0 ? shotIds.length : readPositiveNumber(payload.variantCount, 1)
  const targetShotIds = shotIds.length > 0 ? shotIds : []
  const generationMode = readGenerationMode(
    payload.generationMode,
    readGenerationMode(beatSnapshot.generationMode, 'hybrid'),
  )

  const { project, beat, seedImageUrl, lastFrameImageUrl } = await resolveSeedImageForBeat(job, {
    beatId,
    imageModel,
  })
  const prompt = buildGameplayShotPrompt({
    beatIntent: beat.intent,
    archetype: beat.archetype,
    camera: beat.camera,
    visualStyle: project.visualStyle,
    uiStyle: project.uiStyle,
    references: project.references,
    generationMode,
  })

  const createdShotIds: string[] = []
  for (let index = 0; index < variantCount; index += 1) {
    const shotId = targetShotIds[index] || null
    if (!shotId) continue

    await reportTaskProgress(job, 30 + index * 20, {
      stage: 'gameplay_generate_shot',
      beatId,
      shotId,
    })

    const result = await resolveVideoSourceFromGeneration(job, {
      userId: job.data.userId,
      modelId: videoModel,
      imageUrl: seedImageUrl,
      options: {
        prompt,
        duration: beat.durationSec,
        aspectRatio: project.aspectRatio,
        generationMode: generationMode === 'first-last-frame' && lastFrameImageUrl ? 'firstlastframe' : 'normal',
        ...(generationMode === 'first-last-frame' && lastFrameImageUrl
          ? { lastFrameImageUrl }
          : {}),
      },
    })

    await assertTaskActive(job, 'gameplay_persist_shot')

    const videoStorageKey = await uploadVideoSourceToCos(
      result.url,
      'gameplay-shot',
      shotId,
      result.downloadHeaders,
    )

    await prisma.gameplayShot.update({
      where: { id: shotId },
      data: {
        mode: generationMode,
        prompt,
        videoUrl: videoStorageKey,
        status: beat.selectedShotId || index > 0 ? 'ready' : 'selected',
      },
    })

    createdShotIds.push(shotId)
  }

  if (!beat.selectedShotId && createdShotIds.length > 0) {
    await prisma.gameplayBeat.update({
      where: { id: beatId },
      data: {
        selectedShotId: createdShotIds[0],
      },
    })
  }

  await syncGameplayEditorProject(job.data.projectId)

  return {
    beatId,
    shotIds: createdShotIds,
  }
}

async function handleGameplayVoiceoverGenerateTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const project = await loadGameplayVideoProject(job.data.projectId)
  const beatIds = readStringArray(payload.beatIds)
  const targetBeats = project.beats.filter((beat) =>
    (beatIds.length === 0 || beatIds.includes(beat.id)) && !!beat.voiceoverText,
  )

  if (targetBeats.length === 0) {
    throw new Error('No gameplay beats with voiceover text found')
  }

  const narratorVoice = readString(payload.narratorVoice) || project.narratorVoice
  if (!narratorVoice) {
    throw new Error('GAMEPLAY_NARRATOR_VOICE_REQUIRED')
  }

  const generatedBeatIds: string[] = []
  for (let index = 0; index < targetBeats.length; index += 1) {
    const beat = targetBeats[index]
    if (!beat.voiceoverText) continue

    await reportTaskProgress(job, 20 + index * 20, {
      stage: 'gameplay_generate_voiceover',
      beatId: beat.id,
    })

    const generated = await generateGameplayVoiceover({
      userId: job.data.userId,
      beatId: beat.id,
      text: beat.voiceoverText,
      narratorVoice,
      audioModel: readString(payload.audioModel) || project.audioModel,
    })

    await prisma.gameplayBeat.update({
      where: { id: beat.id },
      data: {
        voiceoverAudioUrl: generated.audioUrl,
        voiceoverDurationMs: generated.durationMs,
      },
    })

    generatedBeatIds.push(beat.id)
  }

  await syncGameplayEditorProject(job.data.projectId)

  return {
    beatIds: generatedBeatIds,
  }
}

async function handleGameplayRenderTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const renderVersionId = readString(payload.renderVersionId) || job.data.targetId
  if (!renderVersionId) throw new Error('GAMEPLAY_RENDER_VERSION_REQUIRED')

  await prisma.gameplayRenderVersion.update({
    where: { id: renderVersionId },
    data: {
      status: 'rendering',
      errorMessage: null,
    },
  })

  await reportTaskProgress(job, 30, {
    stage: 'gameplay_render',
    renderVersionId,
  })

  try {
    const outputUrl = await renderGameplayVideoToStorage({
      projectId: job.data.projectId,
      renderVersionId,
    })

    await prisma.gameplayRenderVersion.update({
      where: { id: renderVersionId },
      data: {
        status: 'completed',
        outputUrl,
        errorMessage: null,
      },
    })

    await prisma.gameplayEditProject.updateMany({
      where: {
        gameplayVideoProjectId: (await loadGameplayVideoProject(job.data.projectId)).id,
      },
      data: {
        renderStatus: 'completed',
        outputUrl,
      },
    })

    return {
      renderVersionId,
      outputUrl,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await prisma.gameplayRenderVersion.update({
      where: { id: renderVersionId },
      data: {
        status: 'failed',
        errorMessage: message,
      },
    })
    await prisma.gameplayEditProject.updateMany({
      where: {
        gameplayVideoProjectId: (await loadGameplayVideoProject(job.data.projectId)).id,
      },
      data: {
        renderStatus: 'failed',
      },
    })
    throw error
  }
}

export async function handleGameplaySelectShot(params: {
  projectId: string
  beatId: string
  shotId: string
}) {
  return await selectGameplayShot(params.projectId, params.beatId, params.shotId)
}

export async function handleGameplayTaskByType(job: Job<TaskJobData>) {
  switch (job.data.type) {
    case TASK_TYPE.GAMEPLAY_BEATS_GENERATE:
      return await handleGameplayBeatsGenerateTask(job)
    case TASK_TYPE.GAMEPLAY_UI_COMPOSE:
      return await handleGameplayUiComposeTask(job)
    case TASK_TYPE.GAMEPLAY_KEYFRAME_GENERATE:
      return await handleGameplayKeyframeGenerateTask(job)
    case TASK_TYPE.GAMEPLAY_SHOT_GENERATE:
      return await handleGameplayShotGenerateTask(job)
    case TASK_TYPE.GAMEPLAY_VOICEOVER_GENERATE:
      return await handleGameplayVoiceoverGenerateTask(job)
    case TASK_TYPE.GAMEPLAY_RENDER:
      return await handleGameplayRenderTask(job)
    default:
      throw new Error(`Unsupported gameplay task type: ${job.data.type}`)
  }
}

export async function handleGameplayRenderMetadata(projectId: string) {
  const project = await loadGameplayVideoProject(projectId)
  return {
    endSlate: normalizeEndSlateConfig(JSON.stringify(project.endSlateConfig)),
    beatCount: project.beats.length,
  }
}
