import type { MediaRef } from './project'

export type GameplayReferenceKind =
  | 'style'
  | 'composition'
  | 'ui'
  | 'motion'
  | 'firstFrame'
  | 'lastFrame'

export type GameplayBeatGenerationMode =
  | 'hybrid'
  | 'image-to-video'
  | 'text-to-video'
  | 'first-last-frame'

export interface GameplayBrief {
  id: string
  gameplayVideoProjectId: string
  script: string
  sellingPoints: string[] | null
  coreLoop: string | null
  targetAudience: string | null
  platforms: string[] | null
  cta: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface GameplayReference {
  id: string
  gameplayVideoProjectId: string
  kind: GameplayReferenceKind | string
  title: string | null
  imageUrl: string | null
  notes: string | null
  media?: MediaRef | null
  createdAt: string
  updatedAt: string
}

export interface GameplayUiOverlaySpec {
  id: string
  type: 'badge' | 'damage' | 'objective' | 'caption' | 'reticle' | 'cta'
  text: string
  position:
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'center'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right'
  emphasis?: 'low' | 'medium' | 'high'
  color?: string | null
}

export interface GameplayKeyframe {
  id: string
  beatId: string
  kind: 'first' | 'middle' | 'last' | string
  prompt: string | null
  imageUrl: string | null
  media?: MediaRef | null
  referenceIds: string[] | null
  createdAt: string
  updatedAt: string
}

export interface GameplayShot {
  id: string
  beatId: string
  variantIndex: number
  mode: GameplayBeatGenerationMode | string
  prompt: string | null
  videoUrl: string | null
  media?: MediaRef | null
  status: string
  notes: string | null
  overlaySpec: GameplayUiOverlaySpec[] | null
  createdAt: string
  updatedAt: string
}

export interface GameplayBeat {
  id: string
  gameplayVideoProjectId: string
  orderIndex: number
  archetype: string | null
  intent: string
  durationSec: number
  camera: string | null
  uiNeeds: string[] | null
  subtitleText: string | null
  voiceoverText: string | null
  voiceoverAudioUrl: string | null
  voiceoverAudioMedia?: MediaRef | null
  voiceoverDurationMs: number | null
  generationMode: GameplayBeatGenerationMode | string
  shotPrompt: string | null
  overlaySpec: GameplayUiOverlaySpec[] | null
  selectedShotId: string | null
  keyframes: GameplayKeyframe[]
  shots: GameplayShot[]
  createdAt: string
  updatedAt: string
}

export interface GameplayEndSlateConfig {
  title: string
  tagline?: string | null
  cta?: string | null
  logoUrl?: string | null
  backgroundUrl?: string | null
}

export interface GameplayEditProjectRecord {
  id: string
  gameplayVideoProjectId: string
  projectData: string
  renderStatus: string | null
  renderTaskId: string | null
  outputUrl: string | null
  outputMedia?: MediaRef | null
  createdAt: string
  updatedAt: string
}

export interface GameplayRenderVersion {
  id: string
  gameplayVideoProjectId: string
  editorProjectId: string | null
  language: string
  aspectRatio: string
  status: string
  outputUrl: string | null
  outputMedia?: MediaRef | null
  taskId: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface GameplayVideoProject {
  id: string
  projectId: string
  language: string
  aspectRatio: string
  targetDurationSec: number
  visualStyle: string | null
  uiStyle: string | null
  narratorVoice: string | null
  endSlateConfig: GameplayEndSlateConfig | null
  analysisModel: string | null
  imageModel: string | null
  videoModel: string | null
  audioModel: string | null
  brief: GameplayBrief | null
  references: GameplayReference[]
  beats: GameplayBeat[]
  editorProject: GameplayEditProjectRecord | null
  renderVersions: GameplayRenderVersion[]
  createdAt: string
  updatedAt: string
}

