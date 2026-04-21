import type { MediaObject } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSignedUrl } from '@/lib/storage'
import type { MediaRef } from '@/types/project'
import type {
  GameplayBeat,
  GameplayBrief,
  GameplayEditProjectRecord,
  GameplayEndSlateConfig,
  GameplayKeyframe,
  GameplayReference,
  GameplayRenderVersion,
  GameplayShot,
  GameplayUiOverlaySpec,
  GameplayVideoProject,
} from '@/types/gameplay-video'
import type { VideoEditorProject, VideoClip } from '@/features/video-editor'
import { buildGameplayEndSlateDefaults } from './pipeline'

type JsonRecord = Record<string, unknown>

type GameplayEditRecord = NonNullable<Awaited<ReturnType<typeof prisma.gameplayEditProject.findUnique>>>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJsonValue<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function parseStringArray(value: string | null | undefined): string[] | null {
  const parsed = parseJsonValue<unknown>(value, [])
  if (!Array.isArray(parsed)) return null
  const strings = parsed
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
  return strings.length > 0 ? strings : null
}

function stringifyJson(value: unknown): string | null {
  if (value === undefined || value === null) return null
  return JSON.stringify(value)
}

function signMediaUrl(value: string | null | undefined): string | null {
  if (!value) return null
  if (
    value.startsWith('images/')
    || value.startsWith('video/')
    || value.startsWith('voice/')
  ) {
    return getSignedUrl(value, 3600)
  }
  return value
}

function toSizeNumber(value: bigint | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  return typeof value === 'bigint' ? Number(value) : value
}

function toMediaRef(media: MediaObject | null | undefined): MediaRef | null {
  if (!media) return null
  return {
    id: media.id,
    publicId: media.publicId,
    url: signMediaUrl(media.storageKey) || media.storageKey,
    mimeType: media.mimeType,
    sizeBytes: toSizeNumber(media.sizeBytes),
    width: media.width,
    height: media.height,
    durationMs: media.durationMs,
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

function serializeBrief(record: Record<string, unknown> | null | undefined): GameplayBrief | null {
  if (!record) return null
  return {
    id: String(record.id),
    gameplayVideoProjectId: String(record.gameplayVideoProjectId),
    script: typeof record.script === 'string' ? record.script : '',
    sellingPoints: parseStringArray(record.sellingPoints as string | null | undefined),
    coreLoop: typeof record.coreLoop === 'string' ? record.coreLoop : null,
    targetAudience: typeof record.targetAudience === 'string' ? record.targetAudience : null,
    platforms: parseStringArray(record.platforms as string | null | undefined),
    cta: typeof record.cta === 'string' ? record.cta : null,
    notes: typeof record.notes === 'string' ? record.notes : null,
    createdAt: toIso(record.createdAt as Date),
    updatedAt: toIso(record.updatedAt as Date),
  }
}

function serializeReference(record: Record<string, unknown>): GameplayReference {
  return {
    id: String(record.id),
    gameplayVideoProjectId: String(record.gameplayVideoProjectId),
    kind: String(record.kind || 'style'),
    title: typeof record.title === 'string' ? record.title : null,
    imageUrl: signMediaUrl(record.imageUrl as string | null | undefined),
    notes: typeof record.notes === 'string' ? record.notes : null,
    media: toMediaRef(record.imageMedia as MediaObject | null | undefined),
    createdAt: toIso(record.createdAt as Date),
    updatedAt: toIso(record.updatedAt as Date),
  }
}

function serializeKeyframe(record: Record<string, unknown>): GameplayKeyframe {
  return {
    id: String(record.id),
    beatId: String(record.beatId),
    kind: String(record.kind || 'first'),
    prompt: typeof record.prompt === 'string' ? record.prompt : null,
    imageUrl: signMediaUrl(record.imageUrl as string | null | undefined),
    media: toMediaRef(record.imageMedia as MediaObject | null | undefined),
    referenceIds: parseStringArray(record.referenceIds as string | null | undefined),
    createdAt: toIso(record.createdAt as Date),
    updatedAt: toIso(record.updatedAt as Date),
  }
}

function serializeShot(record: Record<string, unknown>): GameplayShot {
  return {
    id: String(record.id),
    beatId: String(record.beatId),
    variantIndex: Number(record.variantIndex || 0),
    mode: String(record.mode || 'hybrid'),
    prompt: typeof record.prompt === 'string' ? record.prompt : null,
    videoUrl: signMediaUrl(record.videoUrl as string | null | undefined),
    media: toMediaRef(record.videoMedia as MediaObject | null | undefined),
    status: String(record.status || 'draft'),
    notes: typeof record.notes === 'string' ? record.notes : null,
    overlaySpec: parseJsonValue<GameplayUiOverlaySpec[] | null>(
      record.overlaySpec as string | null | undefined,
      null,
    ),
    createdAt: toIso(record.createdAt as Date),
    updatedAt: toIso(record.updatedAt as Date),
  }
}

function serializeBeat(record: Record<string, unknown>): GameplayBeat {
  const shots = Array.isArray(record.shots)
    ? (record.shots as Record<string, unknown>[]).map(serializeShot)
    : []
  const selectedShotId = typeof record.selectedShotId === 'string'
    ? record.selectedShotId
    : (shots.find((shot) => shot.status === 'selected')?.id || null)

  return {
    id: String(record.id),
    gameplayVideoProjectId: String(record.gameplayVideoProjectId),
    orderIndex: Number(record.orderIndex || 0),
    archetype: typeof record.archetype === 'string' ? record.archetype : null,
    intent: typeof record.intent === 'string' ? record.intent : '',
    durationSec: Number(record.durationSec || 3),
    camera: typeof record.camera === 'string' ? record.camera : null,
    uiNeeds: parseStringArray(record.uiNeeds as string | null | undefined),
    subtitleText: typeof record.subtitleText === 'string' ? record.subtitleText : null,
    voiceoverText: typeof record.voiceoverText === 'string' ? record.voiceoverText : null,
    voiceoverAudioUrl: signMediaUrl(record.voiceoverAudioUrl as string | null | undefined),
    voiceoverAudioMedia: toMediaRef(record.voiceoverAudioMedia as MediaObject | null | undefined),
    voiceoverDurationMs: typeof record.voiceoverDurationMs === 'number' ? record.voiceoverDurationMs : null,
    generationMode: String(record.generationMode || 'hybrid'),
    shotPrompt: typeof record.shotPrompt === 'string' ? record.shotPrompt : null,
    overlaySpec: parseJsonValue<GameplayUiOverlaySpec[] | null>(
      record.overlaySpec as string | null | undefined,
      null,
    ),
    selectedShotId,
    keyframes: Array.isArray(record.keyframes)
      ? (record.keyframes as Record<string, unknown>[]).map(serializeKeyframe)
      : [],
    shots,
    createdAt: toIso(record.createdAt as Date),
    updatedAt: toIso(record.updatedAt as Date),
  }
}

function serializeEditProject(record: Record<string, unknown> | null | undefined): GameplayEditProjectRecord | null {
  if (!record) return null
  return {
    id: String(record.id),
    gameplayVideoProjectId: String(record.gameplayVideoProjectId),
    projectData: typeof record.projectData === 'string' ? record.projectData : '{}',
    renderStatus: typeof record.renderStatus === 'string' ? record.renderStatus : null,
    renderTaskId: typeof record.renderTaskId === 'string' ? record.renderTaskId : null,
    outputUrl: signMediaUrl(record.outputUrl as string | null | undefined),
    outputMedia: toMediaRef(record.outputMedia as MediaObject | null | undefined),
    createdAt: toIso(record.createdAt as Date),
    updatedAt: toIso(record.updatedAt as Date),
  }
}

function serializeRenderVersion(record: Record<string, unknown>): GameplayRenderVersion {
  return {
    id: String(record.id),
    gameplayVideoProjectId: String(record.gameplayVideoProjectId),
    editorProjectId: typeof record.editorProjectId === 'string' ? record.editorProjectId : null,
    language: String(record.language || 'zh'),
    aspectRatio: String(record.aspectRatio || '9:16'),
    status: String(record.status || 'pending'),
    outputUrl: signMediaUrl(record.outputUrl as string | null | undefined),
    outputMedia: toMediaRef(record.outputMedia as MediaObject | null | undefined),
    taskId: typeof record.taskId === 'string' ? record.taskId : null,
    errorMessage: typeof record.errorMessage === 'string' ? record.errorMessage : null,
    createdAt: toIso(record.createdAt as Date),
    updatedAt: toIso(record.updatedAt as Date),
  }
}

export function normalizeEndSlateConfig(value: string | null | undefined): GameplayEndSlateConfig | null {
  const parsed = parseJsonValue<unknown>(value, null)
  if (!isRecord(parsed)) return null
  const title = typeof parsed.title === 'string' ? parsed.title.trim() : ''
  if (!title) return null
  return buildGameplayEndSlateDefaults({
    title,
    tagline: typeof parsed.tagline === 'string' ? parsed.tagline : null,
    cta: typeof parsed.cta === 'string' ? parsed.cta : null,
    logoUrl: typeof parsed.logoUrl === 'string' ? signMediaUrl(parsed.logoUrl) : null,
    backgroundUrl: typeof parsed.backgroundUrl === 'string' ? signMediaUrl(parsed.backgroundUrl) : null,
  })
}

async function fetchGameplayProjectRecord(projectId: string) {
  const record = await prisma.gameplayVideoProject.findUnique({
    where: { projectId },
    include: {
      brief: true,
      references: {
        include: { imageMedia: true },
        orderBy: { createdAt: 'asc' },
      },
      beats: {
        orderBy: { orderIndex: 'asc' },
        include: {
          keyframes: {
            include: { imageMedia: true },
            orderBy: { createdAt: 'asc' },
          },
          shots: {
            include: { videoMedia: true },
            orderBy: { variantIndex: 'asc' },
          },
          voiceoverAudioMedia: true,
        },
      },
      editorProject: {
        include: { outputMedia: true },
      },
      renderVersions: {
        include: { outputMedia: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!record) {
    throw new Error('Gameplay video project not found')
  }

  return record
}

export async function ensureGameplayVideoProject(projectId: string) {
  return await prisma.gameplayVideoProject.upsert({
    where: { projectId },
    create: {
      projectId,
      language: 'zh',
      aspectRatio: '9:16',
      targetDurationSec: 20,
      endSlateConfig: stringifyJson(buildGameplayEndSlateDefaults({
        title: '立即体验核心玩法',
        cta: '预约 / 下载',
      })),
    },
    update: {},
  })
}

export function serializeGameplayVideoProject(
  record: Awaited<ReturnType<typeof fetchGameplayProjectRecord>>,
): GameplayVideoProject {
  return {
    id: record.id,
    projectId: record.projectId,
    language: record.language,
    aspectRatio: record.aspectRatio,
    targetDurationSec: record.targetDurationSec,
    visualStyle: record.visualStyle,
    uiStyle: record.uiStyle,
    narratorVoice: record.narratorVoice,
    endSlateConfig: normalizeEndSlateConfig(record.endSlateConfig),
    analysisModel: record.analysisModel,
    imageModel: record.imageModel,
    videoModel: record.videoModel,
    audioModel: record.audioModel,
    brief: serializeBrief(record.brief as unknown as Record<string, unknown> | null),
    references: record.references.map((item) => serializeReference(item as unknown as Record<string, unknown>)),
    beats: record.beats.map((item) => serializeBeat(item as unknown as Record<string, unknown>)),
    editorProject: serializeEditProject(record.editorProject as unknown as Record<string, unknown> | null),
    renderVersions: record.renderVersions.map((item) => serializeRenderVersion(item as unknown as Record<string, unknown>)),
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
  }
}

export async function loadGameplayVideoProject(projectId: string) {
  await ensureGameplayVideoProject(projectId)
  const record = await fetchGameplayProjectRecord(projectId)
  return serializeGameplayVideoProject(record)
}

export async function upsertGameplayBrief(params: {
  projectId: string
  script: string
  sellingPoints?: string[] | null
  coreLoop?: string | null
  targetAudience?: string | null
  platforms?: string[] | null
  cta?: string | null
  notes?: string | null
  targetDurationSec?: number | null
  visualStyle?: string | null
  uiStyle?: string | null
  narratorVoice?: string | null
  analysisModel?: string | null
  imageModel?: string | null
  videoModel?: string | null
  audioModel?: string | null
  aspectRatio?: string | null
  language?: string | null
  endSlateConfig?: GameplayEndSlateConfig | null
}) {
  const project = await ensureGameplayVideoProject(params.projectId)
  await prisma.gameplayBrief.upsert({
    where: { gameplayVideoProjectId: project.id },
    create: {
      gameplayVideoProjectId: project.id,
      script: params.script,
      sellingPoints: stringifyJson(params.sellingPoints || null),
      coreLoop: params.coreLoop || null,
      targetAudience: params.targetAudience || null,
      platforms: stringifyJson(params.platforms || null),
      cta: params.cta || null,
      notes: params.notes || null,
    },
    update: {
      script: params.script,
      sellingPoints: stringifyJson(params.sellingPoints || null),
      coreLoop: params.coreLoop || null,
      targetAudience: params.targetAudience || null,
      platforms: stringifyJson(params.platforms || null),
      cta: params.cta || null,
      notes: params.notes || null,
    },
  })

  await prisma.gameplayVideoProject.update({
    where: { id: project.id },
    data: {
      ...(typeof params.targetDurationSec === 'number' ? { targetDurationSec: params.targetDurationSec } : {}),
      ...(params.visualStyle !== undefined ? { visualStyle: params.visualStyle || null } : {}),
      ...(params.uiStyle !== undefined ? { uiStyle: params.uiStyle || null } : {}),
      ...(params.narratorVoice !== undefined ? { narratorVoice: params.narratorVoice || null } : {}),
      ...(params.analysisModel !== undefined ? { analysisModel: params.analysisModel || null } : {}),
      ...(params.imageModel !== undefined ? { imageModel: params.imageModel || null } : {}),
      ...(params.videoModel !== undefined ? { videoModel: params.videoModel || null } : {}),
      ...(params.audioModel !== undefined ? { audioModel: params.audioModel || null } : {}),
      ...(params.aspectRatio ? { aspectRatio: params.aspectRatio } : {}),
      ...(params.language ? { language: params.language } : {}),
      ...(params.endSlateConfig ? { endSlateConfig: stringifyJson(params.endSlateConfig) } : {}),
    },
  })

  return await loadGameplayVideoProject(params.projectId)
}

export async function createGameplayReferences(params: {
  projectId: string
  references: Array<{
    kind: string
    title?: string | null
    imageUrl?: string | null
    notes?: string | null
    imageMediaId?: string | null
  }>
}) {
  const project = await ensureGameplayVideoProject(params.projectId)
  for (const reference of params.references) {
    await prisma.gameplayReference.create({
      data: {
        gameplayVideoProjectId: project.id,
        kind: reference.kind || 'style',
        title: reference.title || null,
        imageUrl: reference.imageUrl || null,
        notes: reference.notes || null,
        imageMediaId: reference.imageMediaId || null,
      },
    })
  }

  return await loadGameplayVideoProject(params.projectId)
}

export async function deleteGameplayReference(projectId: string, referenceId: string) {
  const project = await ensureGameplayVideoProject(projectId)
  const reference = await prisma.gameplayReference.findUnique({
    where: { id: referenceId },
  })
  if (!reference || reference.gameplayVideoProjectId !== project.id) {
    throw new Error('Gameplay reference not found')
  }
  await prisma.gameplayReference.delete({
    where: { id: referenceId },
  })
  return await loadGameplayVideoProject(projectId)
}

function resolveVideoSize(aspectRatio: string) {
  if (aspectRatio === '16:9') {
    return { width: 1920, height: 1080 }
  }
  return { width: 1080, height: 1920 }
}

function createBeatClip(beat: GameplayBeat, fps: number): VideoClip | null {
  const selectedShot = beat.shots.find((shot) => shot.id === beat.selectedShotId) || beat.shots[0] || null
  if (!selectedShot?.videoUrl) return null

  return {
    id: `beat-${beat.id}`,
    kind: 'video',
    src: selectedShot.videoUrl,
    durationInFrames: Math.max(30, Math.round((beat.durationSec || 3) * fps)),
    attachment: {
      ...(beat.voiceoverAudioUrl
        ? {
            audio: {
              src: beat.voiceoverAudioUrl,
              volume: 1,
            },
          }
        : {}),
      ...(beat.subtitleText
        ? {
            subtitle: {
              text: beat.subtitleText,
              style: 'default',
            },
          }
        : {}),
      ...(beat.overlaySpec ? { uiOverlays: beat.overlaySpec } : {}),
    },
    transition: {
      type: 'dissolve',
      durationInFrames: 8,
    },
    metadata: {
      beatId: beat.id,
      shotId: selectedShot.id,
      description: beat.intent,
    },
  }
}

export function buildDefaultGameplayEditorProject(project: GameplayVideoProject): VideoEditorProject {
  const fps = 30
  const { width, height } = resolveVideoSize(project.aspectRatio)
  const timeline = project.beats
    .map((beat) => createBeatClip(beat, fps))
    .filter((clip): clip is VideoClip => !!clip)

  const endSlate = buildGameplayEndSlateDefaults({
    title: project.endSlateConfig?.title || '立即体验核心玩法',
    tagline: project.endSlateConfig?.tagline || project.visualStyle || null,
    cta: project.endSlateConfig?.cta || project.brief?.cta || null,
    logoUrl: project.endSlateConfig?.logoUrl || null,
    backgroundUrl: project.endSlateConfig?.backgroundUrl || null,
  })

  timeline.push({
    id: `end-slate-${project.id}`,
    kind: 'end-slate',
    durationInFrames: 90,
    attachment: {
      endSlate,
    },
    metadata: {
      description: 'Gameplay end slate',
      referenceIds: project.references.map((reference) => reference.id),
    },
  })

  return {
    id: `gameplay-editor-${project.id}`,
    episodeId: project.id,
    schemaVersion: '1.0',
    config: {
      fps,
      width,
      height,
    },
    timeline,
    bgmTrack: [],
  }
}

export async function syncGameplayEditorProject(projectId: string) {
  const project = await loadGameplayVideoProject(projectId)
  const editorProject = buildDefaultGameplayEditorProject(project)
  const dbRecord = await prisma.gameplayEditProject.upsert({
    where: { gameplayVideoProjectId: project.id },
    create: {
      gameplayVideoProjectId: project.id,
      projectData: JSON.stringify(editorProject),
    },
    update: {
      projectData: JSON.stringify(editorProject),
      updatedAt: new Date(),
    },
  })

  return {
    record: dbRecord,
    projectData: editorProject,
  }
}

export async function loadGameplayEditorProject(projectId: string): Promise<{
  record: GameplayEditRecord
  projectData: VideoEditorProject
}> {
  const project = await loadGameplayVideoProject(projectId)
  const record = await prisma.gameplayEditProject.findUnique({
    where: { gameplayVideoProjectId: project.id },
    include: { outputMedia: true },
  })

  if (!record) {
    return await syncGameplayEditorProject(projectId)
  }

  return {
    record,
    projectData: parseJsonValue<VideoEditorProject>(
      record.projectData,
      buildDefaultGameplayEditorProject(project),
    ),
  }
}

export async function saveGameplayEditorProject(projectId: string, projectData: VideoEditorProject) {
  const project = await loadGameplayVideoProject(projectId)
  return await prisma.gameplayEditProject.upsert({
    where: { gameplayVideoProjectId: project.id },
    create: {
      gameplayVideoProjectId: project.id,
      projectData: JSON.stringify(projectData),
    },
    update: {
      projectData: JSON.stringify(projectData),
      updatedAt: new Date(),
    },
  })
}

export async function selectGameplayShot(projectId: string, beatId: string, shotId: string) {
  const project = await ensureGameplayVideoProject(projectId)
  const shot = await prisma.gameplayShot.findUnique({
    where: { id: shotId },
    include: {
      beat: true,
    },
  })

  if (!shot || shot.beat.gameplayVideoProjectId !== project.id || shot.beatId !== beatId) {
    throw new Error('Gameplay shot not found')
  }

  await prisma.$transaction([
    prisma.gameplayBeat.update({
      where: { id: beatId },
      data: { selectedShotId: shotId },
    }),
    prisma.gameplayShot.updateMany({
      where: { beatId },
      data: { status: 'draft' },
    }),
    prisma.gameplayShot.update({
      where: { id: shotId },
      data: { status: 'selected' },
    }),
  ])

  await syncGameplayEditorProject(projectId)
  return await loadGameplayVideoProject(projectId)
}

export async function markGameplayRenderPending(projectId: string, renderVersionId: string, taskId: string) {
  const project = await loadGameplayVideoProject(projectId)
  await prisma.gameplayRenderVersion.update({
    where: { id: renderVersionId },
    data: {
      taskId,
      status: 'pending',
    },
  })

  await prisma.gameplayEditProject.updateMany({
    where: { gameplayVideoProjectId: project.id },
    data: {
      renderTaskId: taskId,
      renderStatus: 'pending',
    },
  })
}
