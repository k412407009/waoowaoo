import { describe, expect, it } from 'vitest'
import {
  buildGameplayEndSlateDefaults,
  buildGameplayUiOverlaySpec,
  generateGameplayBeatDrafts,
} from '@/lib/gameplay-video/pipeline'

describe('gameplay video pipeline', () => {
  it('builds beat drafts from script, selling points, and cta with gameplay archetypes', () => {
    const beats = generateGameplayBeatDrafts({
      script: [
        '开场展示主角冲刺接近 BOSS',
        '释放大招造成高额伤害并击败敌人',
        '马上下载体验完整战斗循环',
      ].join('\n'),
      targetDurationSec: 20,
      visualStyle: '明亮、锐利、偏卡通渲染',
      uiStyle: '高辨识度移动端战斗 HUD',
      sellingPoints: ['高爆发技能反馈'],
      cta: '立即下载开战',
      references: [
        {
          id: 'ref-1',
          gameplayVideoProjectId: 'gp-1',
          kind: 'style',
          title: '竞品战斗首帧',
          imageUrl: 'https://example.com/ref-1.png',
          notes: '暖色战斗氛围，主体置中',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    })

    expect(beats).toHaveLength(5)
    expect(beats[0]).toMatchObject({
      orderIndex: 0,
      archetype: '战斗反馈',
      generationMode: 'first-last-frame',
    })
    expect(beats.some((beat) => beat.intent.includes('高爆发技能反馈'))).toBe(true)
    expect(beats.some((beat) => beat.intent.includes('立即下载开战'))).toBe(true)
    expect(beats.every((beat) => beat.shotPrompt.includes('纵向 9:16 安全区构图'))).toBe(true)
  })

  it('builds overlay specs with intent cues, subtitle, and cta while capping the result count', () => {
    const overlays = buildGameplayUiOverlaySpec({
      intent: '主角锁定 boss 并击败目标',
      uiNeeds: ['伤害数字', '目标提示'],
      subtitleText: '三秒打穿 BOSS',
      cta: '立即下载',
    })

    expect(overlays).toHaveLength(5)
    expect(overlays).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'damage', position: 'top-right' }),
      expect.objectContaining({ type: 'objective', position: 'top-left' }),
      expect.objectContaining({ type: 'reticle', text: '锁定 BOSS' }),
      expect.objectContaining({ type: 'caption', text: '三秒打穿 BOSS' }),
      expect.objectContaining({ type: 'cta', position: 'bottom-right', text: '立即下载' }),
    ]))
  })

  it('normalizes end slate defaults and trims optional fields', () => {
    expect(buildGameplayEndSlateDefaults({
      title: '  现在开玩  ',
      tagline: '  30 秒看懂核心循环  ',
      cta: '  立即预约  ',
      logoUrl: 'https://example.com/logo.png',
    })).toEqual({
      title: '现在开玩',
      tagline: '30 秒看懂核心循环',
      cta: '立即预约',
      logoUrl: 'https://example.com/logo.png',
    })

    expect(buildGameplayEndSlateDefaults({})).toEqual({
      title: '立即体验核心玩法',
    })
  })
})
