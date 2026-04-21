import type {
  GameplayBeatGenerationMode,
  GameplayEndSlateConfig,
  GameplayReference,
  GameplayUiOverlaySpec,
} from '@/types/gameplay-video'

export type GameplayBeatDraft = {
  orderIndex: number
  archetype: string
  intent: string
  durationSec: number
  camera: string
  uiNeeds: string[]
  subtitleText: string
  voiceoverText: string
  generationMode: GameplayBeatGenerationMode
  shotPrompt: string
}

type DraftInput = {
  script: string
  targetDurationSec: number
  visualStyle?: string | null
  uiStyle?: string | null
  sellingPoints?: string[] | null
  cta?: string | null
  references?: GameplayReference[]
}

type ArchetypeRule = {
  archetype: string
  generationMode: GameplayBeatGenerationMode
  camera: string
  uiNeeds: string[]
  keywords: string[]
}

const ARCHETYPE_RULES: ReadonlyArray<ArchetypeRule> = [
  {
    archetype: '战斗反馈',
    generationMode: 'first-last-frame',
    camera: '近景追踪 + 冲击镜头',
    uiNeeds: ['伤害数字', '技能图标', '连击反馈'],
    keywords: ['战斗', '攻击', '技能', '连击', 'boss', '击败', '爆炸', '斩击', '射击', '必杀'],
  },
  {
    archetype: '资源采集',
    generationMode: 'image-to-video',
    camera: '俯视跟拍 + 节奏推进',
    uiNeeds: ['资源计数', '掉落提示', '目标标记'],
    keywords: ['采集', '收集', '挖矿', '资源', '掉落', '采矿', '砍树', 'loot'],
  },
  {
    archetype: '建造升级',
    generationMode: 'image-to-video',
    camera: '拉近特写 + UI 强化',
    uiNeeds: ['升级按钮', '数值增长', '完成提示'],
    keywords: ['建造', '升级', '扩张', '经营', '基地', '合成', '升星', '强化'],
  },
  {
    archetype: '卡牌结算',
    generationMode: 'image-to-video',
    camera: '定格展示 + 抽拉镜头',
    uiNeeds: ['卡面高亮', '费用数值', '胜利结算'],
    keywords: ['卡牌', '抽卡', '回合', '牌组', '结算', '手牌'],
  },
  {
    archetype: '机动挑战',
    generationMode: 'text-to-video',
    camera: '高速跟拍 + 视角切换',
    uiNeeds: ['速度提示', '轨迹线', '目标提示'],
    keywords: ['跑酷', '漂移', '跳跃', '冲刺', '闪避', '竞速', '躲避'],
  },
]

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function toSentenceCase(value: string): string {
  return normalizeWhitespace(value).replace(/^[，。；、]+|[，。；、]+$/g, '')
}

function splitScript(script: string): string[] {
  const lineSegments = script
    .split(/\n+/)
    .map((line) => toSentenceCase(line))
    .filter(Boolean)

  if (lineSegments.length >= 3) return lineSegments

  return script
    .split(/[。！？!?；;]+/)
    .map((line) => toSentenceCase(line))
    .filter(Boolean)
}

function pickArchetype(intent: string): ArchetypeRule {
  const normalized = intent.toLowerCase()
  const matched = ARCHETYPE_RULES.find((rule) =>
    rule.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())),
  )
  if (matched) return matched

  return {
    archetype: '核心展示',
    generationMode: 'image-to-video',
    camera: '中近景推进 + UI 节奏切换',
    uiNeeds: ['卖点标题', '目标提示'],
    keywords: [],
  }
}

function summarizeReferences(references: GameplayReference[] | undefined): string {
  if (!references || references.length === 0) return '无明确参考图，强调伪实机、可玩 UI、移动端广告节奏。'

  const fragments = references
    .slice(0, 4)
    .map((reference) => {
      const title = reference.title || reference.kind
      const notes = reference.notes ? `：${normalizeWhitespace(reference.notes)}` : ''
      return `${title}${notes}`
    })
    .filter(Boolean)

  return fragments.join('；')
}

function clampBeatCount(count: number): number {
  return Math.max(3, Math.min(6, count))
}

function distributeDurations(totalDuration: number, count: number): number[] {
  const safeTotal = Math.max(9, totalDuration)
  const base = Math.floor(safeTotal / count)
  const durations = Array.from({ length: count }, () => Math.max(2, Math.min(5, base)))
  let current = durations.reduce((sum, value) => sum + value, 0)

  let index = 0
  while (current < safeTotal) {
    durations[index % durations.length] += 1
    current += 1
    index += 1
  }

  index = durations.length - 1
  while (current > safeTotal && index >= 0) {
    if (durations[index] > 2) {
      durations[index] -= 1
      current -= 1
    }
    index -= 1
    if (index < 0 && current > safeTotal) index = durations.length - 1
  }

  return durations
}

function buildPromptParts(params: {
  intent: string
  archetype: string
  camera: string
  visualStyle?: string | null
  uiStyle?: string | null
  referencesSummary: string
}) {
  const parts = [
    '伪实机手游玩法广告镜头',
    `镜头意图：${params.intent}`,
    `玩法语法：${params.archetype}`,
    `镜头运动：${params.camera}`,
    '画面必须像真实可玩的游戏录屏，但允许有广告级强化反馈',
    '保留明确的游戏 UI 区块、按钮、数值反馈、目标提示和技能反馈',
    '不要做纯概念 CG，不要做电影海报感，不要做写实真人',
    `风格参考：${params.visualStyle || '清晰、锐利、手游投放感强'}`,
    `UI 风格：${params.uiStyle || '现代手游 HUD、图标清晰、数值易读'}`,
    `参考约束：${params.referencesSummary}`,
    '纵向 9:16 安全区构图，主体在中上区，底部为字幕保留空间',
  ]

  return parts.filter(Boolean)
}

export function generateGameplayBeatDrafts(input: DraftInput): GameplayBeatDraft[] {
  const sellingPoints = (input.sellingPoints || []).map((item) => normalizeWhitespace(item)).filter(Boolean)
  const segments = splitScript(input.script)
  const cta = input.cta ? normalizeWhitespace(input.cta) : ''

  const mergedSegments = [...segments]
  for (const point of sellingPoints) {
    if (!mergedSegments.some((segment) => segment.includes(point))) {
      mergedSegments.push(point)
    }
  }
  if (cta && !mergedSegments.some((segment) => segment.includes(cta))) {
    mergedSegments.push(cta)
  }

  const beatCount = clampBeatCount(mergedSegments.length || 3)
  const selectedSegments = mergedSegments.slice(0, beatCount)
  while (selectedSegments.length < beatCount) {
    selectedSegments.push(selectedSegments[selectedSegments.length - 1] || '展示核心玩法反馈')
  }

  const totalBeatDuration = Math.max(12, input.targetDurationSec - 3)
  const durations = distributeDurations(totalBeatDuration, beatCount)
  const referencesSummary = summarizeReferences(input.references)

  return selectedSegments.map((segment, index) => {
    const archetypeRule = pickArchetype(segment)
    const subtitleText = segment.length > 24 ? `${segment.slice(0, 24)}...` : segment
    const voiceoverText = segment
    const promptParts = buildPromptParts({
      intent: segment,
      archetype: archetypeRule.archetype,
      camera: archetypeRule.camera,
      visualStyle: input.visualStyle,
      uiStyle: input.uiStyle,
      referencesSummary,
    })

    return {
      orderIndex: index,
      archetype: archetypeRule.archetype,
      intent: segment,
      durationSec: durations[index] || 3,
      camera: archetypeRule.camera,
      uiNeeds: archetypeRule.uiNeeds,
      subtitleText,
      voiceoverText,
      generationMode: archetypeRule.generationMode,
      shotPrompt: promptParts.join('；'),
    }
  })
}

export function buildGameplayKeyframePrompt(params: {
  beatIntent: string
  archetype?: string | null
  camera?: string | null
  visualStyle?: string | null
  uiStyle?: string | null
  kind: 'first' | 'middle' | 'last'
  references?: GameplayReference[]
}) {
  const referencesSummary = summarizeReferences(params.references)
  const shotMoment =
    params.kind === 'first'
      ? '镜头起始构图，动作即将发生'
      : params.kind === 'last'
        ? '镜头结束状态，反馈完成、结果清晰'
        : '镜头中段，动作反馈最强'

  return buildPromptParts({
    intent: `${params.beatIntent}，${shotMoment}`,
    archetype: params.archetype || '核心展示',
    camera: params.camera || '中景推进',
    visualStyle: params.visualStyle,
    uiStyle: params.uiStyle,
    referencesSummary,
  }).join('；')
}

export function buildGameplayShotPrompt(params: {
  beatIntent: string
  archetype?: string | null
  camera?: string | null
  visualStyle?: string | null
  uiStyle?: string | null
  references?: GameplayReference[]
  generationMode: GameplayBeatGenerationMode | string
}) {
  const referencesSummary = summarizeReferences(params.references)
  const generationHint =
    params.generationMode === 'first-last-frame'
      ? '镜头需要明确的起止动作衔接，适合首尾帧驱动'
      : params.generationMode === 'text-to-video'
        ? '镜头是过渡段，强调速度感和节奏感'
        : '镜头以稳定的伪实机玩法演出为主'

  return buildPromptParts({
    intent: `${params.beatIntent}，${generationHint}`,
    archetype: params.archetype || '核心展示',
    camera: params.camera || '中景推进',
    visualStyle: params.visualStyle,
    uiStyle: params.uiStyle,
    referencesSummary,
  }).join('；')
}

function createOverlay(
  index: number,
  type: GameplayUiOverlaySpec['type'],
  text: string,
  position: GameplayUiOverlaySpec['position'],
  emphasis: GameplayUiOverlaySpec['emphasis'],
  color?: string | null,
): GameplayUiOverlaySpec {
  return {
    id: `overlay-${index}`,
    type,
    text,
    position,
    emphasis,
    ...(color ? { color } : {}),
  }
}

export function buildGameplayUiOverlaySpec(params: {
  intent: string
  uiNeeds?: string[] | null
  subtitleText?: string | null
  archetype?: string | null
  cta?: string | null
}): GameplayUiOverlaySpec[] {
  const overlays: GameplayUiOverlaySpec[] = []
  const uiNeeds = (params.uiNeeds || []).map((item) => normalizeWhitespace(item)).filter(Boolean)
  const normalizedIntent = params.intent.toLowerCase()

  uiNeeds.forEach((need, index) => {
    const lowerNeed = need.toLowerCase()
    if (lowerNeed.includes('伤害') || lowerNeed.includes('数值')) {
      overlays.push(createOverlay(index, 'damage', need, 'top-right', 'high', '#fde68a'))
      return
    }
    if (lowerNeed.includes('目标') || lowerNeed.includes('提示')) {
      overlays.push(createOverlay(index, 'objective', need, 'top-left', 'medium'))
      return
    }
    if (lowerNeed.includes('按钮') || lowerNeed.includes('cta')) {
      overlays.push(createOverlay(index, 'cta', need, 'bottom-right', 'high'))
      return
    }
    overlays.push(createOverlay(index, 'badge', need, 'top-center', 'medium'))
  })

  if (normalizedIntent.includes('boss') || normalizedIntent.includes('击败')) {
    overlays.push(createOverlay(overlays.length, 'reticle', '锁定 BOSS', 'center', 'low'))
  }

  if (params.subtitleText) {
    overlays.push(createOverlay(
      overlays.length,
      'caption',
      params.subtitleText,
      'bottom-left',
      'medium',
    ))
  }

  if (params.cta) {
    overlays.push(createOverlay(
      overlays.length,
      'cta',
      params.cta,
      'bottom-right',
      'high',
    ))
  }

  return overlays.slice(0, 5)
}

export function buildGameplayEndSlateDefaults(input: {
  title?: string | null
  tagline?: string | null
  cta?: string | null
  logoUrl?: string | null
  backgroundUrl?: string | null
}): GameplayEndSlateConfig {
  return {
    title: normalizeWhitespace(input.title || '立即体验核心玩法'),
    ...(input.tagline ? { tagline: normalizeWhitespace(input.tagline) } : {}),
    ...(input.cta ? { cta: normalizeWhitespace(input.cta) } : {}),
    ...(input.logoUrl ? { logoUrl: input.logoUrl } : {}),
    ...(input.backgroundUrl ? { backgroundUrl: input.backgroundUrl } : {}),
  }
}
