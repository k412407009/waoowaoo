import { getProviderKey, resolveModelSelectionOrSingle } from '@/lib/api-config'
import { generateBailianAudio } from '@/lib/providers/bailian/audio'
import { uploadAudioSourceToCos } from '@/lib/workers/utils'

export async function generateGameplayVoiceover(params: {
  userId: string
  beatId: string
  text: string
  narratorVoice: string
  audioModel?: string | null
}) {
  const selection = await resolveModelSelectionOrSingle(
    params.userId,
    params.audioModel || null,
    'audio',
  )
  const providerKey = getProviderKey(selection.provider).toLowerCase()

  if (providerKey !== 'bailian') {
    throw new Error('GAMEPLAY_VOICEOVER_PROVIDER_UNSUPPORTED: only bailian audio models are supported in V1')
  }

  if (!params.narratorVoice.trim()) {
    throw new Error('GAMEPLAY_NARRATOR_VOICE_REQUIRED')
  }

  const result = await generateBailianAudio({
    userId: params.userId,
    text: params.text,
    voice: params.narratorVoice.trim(),
    options: {
      provider: selection.provider,
      modelId: selection.modelId,
      modelKey: selection.modelKey,
    },
  })

  if (!result.success || !result.audioUrl) {
    throw new Error(result.error || 'GAMEPLAY_VOICEOVER_FAILED')
  }

  const audioStorageKey = await uploadAudioSourceToCos(
    result.audioUrl,
    'gameplay-voiceover',
    params.beatId,
  )

  return {
    audioUrl: audioStorageKey,
    durationMs: null as number | null,
    modelKey: selection.modelKey,
  }
}
