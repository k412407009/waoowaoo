import React from 'react'
import { AbsoluteFill, Img, Sequence, Video, Audio, useCurrentFrame, interpolate } from 'remotion'
import { VideoClip, BgmClip, EditorConfig, UiOverlayItem, EndSlateContent } from '../types/editor.types'
import { computeClipPositions } from '../utils/time-utils'

interface VideoCompositionProps {
    clips: VideoClip[]
    bgmTrack: BgmClip[]
    config: EditorConfig
}

/**
 * Remotion 主合成组件
 * 使用 Sequence 实现磁性时间轴布局，支持转场效果
 */
export const VideoComposition: React.FC<VideoCompositionProps> = ({
    clips,
    bgmTrack,
    config
}) => {
    const computedClips = computeClipPositions(clips)

    return (
        <AbsoluteFill style={{ backgroundColor: 'black' }}>
            {/* 视频轨道 - 带转场效果 */}
            {computedClips.map((clip, index) => {
                const transitionDuration = clip.transition?.durationInFrames || 0

                return (
                    <Sequence
                        key={clip.id}
                        from={clip.startFrame}
                        durationInFrames={clip.durationInFrames}
                        name={`Clip ${index + 1}`}
                    >
                        <ClipRenderer
                            clip={clip}
                            config={config}
                            transitionType={clip.transition?.type}
                            transitionDuration={transitionDuration}
                            isLastClip={index === computedClips.length - 1}
                        />
                    </Sequence>
                )
            })}

            {/* BGM 轨道 */}
            {bgmTrack.map((bgm) => (
                <Sequence
                    key={bgm.id}
                    from={bgm.startFrame}
                    durationInFrames={bgm.durationInFrames}
                    name={`BGM: ${bgm.id}`}
                >
                    <BgmRenderer bgm={bgm} />
                </Sequence>
            ))}
        </AbsoluteFill>
    )
}

/**
 * BGM 渲染器 - 支持淡入淡出
 */
interface BgmRendererProps {
    bgm: BgmClip
}

const BgmRenderer: React.FC<BgmRendererProps> = ({ bgm }) => {
    const frame = useCurrentFrame()
    const fadeIn = bgm.fadeIn || 0
    const fadeOut = bgm.fadeOut || 0

    let volume = bgm.volume

    // 淡入
    if (fadeIn > 0 && frame < fadeIn) {
        volume *= interpolate(frame, [0, fadeIn], [0, 1], { extrapolateRight: 'clamp' })
    }

    // 淡出
    if (fadeOut > 0 && frame > bgm.durationInFrames - fadeOut) {
        volume *= interpolate(
            frame,
            [bgm.durationInFrames - fadeOut, bgm.durationInFrames],
            [1, 0],
            { extrapolateLeft: 'clamp' }
        )
    }

    return <Audio src={bgm.src} volume={volume} />
}

/**
 * 单个片段渲染器 - 支持转场效果
 */
interface ClipRendererProps {
    clip: VideoClip & { startFrame: number; endFrame: number }
    config: EditorConfig
    transitionType?: 'none' | 'dissolve' | 'fade' | 'slide'
    transitionDuration: number
    isLastClip: boolean
}

const ClipRenderer: React.FC<ClipRendererProps> = ({
    clip,
    config,
    transitionType = 'none',
    transitionDuration,
    isLastClip
}) => {
    void config
    const frame = useCurrentFrame()
    const clipDuration = clip.durationInFrames

    // 计算转场效果
    let opacity = 1
    let transform = 'none'

    if (transitionType !== 'none' && transitionDuration > 0) {
        // 出场转场效果 (在片段末尾)
        if (!isLastClip && frame > clipDuration - transitionDuration) {
            const exitProgress = interpolate(
                frame,
                [clipDuration - transitionDuration, clipDuration],
                [0, 1],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            )

            switch (transitionType) {
                case 'dissolve':
                case 'fade':
                    opacity = 1 - exitProgress
                    break
                case 'slide':
                    transform = `translateX(${-exitProgress * 100}%)`
                    break
            }
        }

        // 入场转场效果 (在片段开头)
        if (frame < transitionDuration) {
            const enterProgress = interpolate(
                frame,
                [0, transitionDuration],
                [0, 1],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            )

            switch (transitionType) {
                case 'dissolve':
                case 'fade':
                    opacity = enterProgress
                    break
                case 'slide':
                    transform = `translateX(${(1 - enterProgress) * 100}%)`
                    break
            }
        }
    }

    return (
        <AbsoluteFill style={{ opacity, transform }}>
            {clip.kind === 'end-slate' || !clip.src ? (
                <EndSlateRenderer content={clip.attachment?.endSlate} />
            ) : (
                <Video
                    src={clip.src}
                    startFrom={clip.trim?.from || 0}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                    }}
                />
            )}

            {/* 附属配音 */}
            {clip.attachment?.audio && (
                <Audio
                    src={clip.attachment.audio.src}
                    volume={clip.attachment.audio.volume}
                />
            )}

            {/* 附属字幕 */}
            {clip.attachment?.subtitle && (
                <SubtitleOverlay
                    text={clip.attachment.subtitle.text}
                    style={clip.attachment.subtitle.style}
                />
            )}

            {clip.attachment?.uiOverlays && clip.attachment.uiOverlays.length > 0 && (
                <UiOverlayLayer items={clip.attachment.uiOverlays} />
            )}
        </AbsoluteFill>
    )
}

/**
 * 字幕叠加层
 */
interface SubtitleOverlayProps {
    text: string
    style: 'default' | 'cinematic'
}

const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({ text, style }) => {
    const styles = {
        default: {
            background: 'rgba(0, 0, 0, 0.7)',
            padding: '8px 16px',
            borderRadius: '4px',
            fontSize: '24px',
            color: 'white'
        },
        cinematic: {
            background: 'transparent',
            padding: '12px 24px',
            fontSize: '28px',
            color: 'white',
            textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)',
            fontWeight: 'bold' as const
        }
    }

    return (
        <AbsoluteFill
            style={{
                justifyContent: 'flex-end',
                alignItems: 'center',
                paddingBottom: '60px'
            }}
        >
            <div style={styles[style]}>
                {text}
            </div>
        </AbsoluteFill>
    )
}

interface UiOverlayLayerProps {
    items: UiOverlayItem[]
}

function resolveOverlayAnchor(position: UiOverlayItem['position']): React.CSSProperties {
    switch (position) {
        case 'top-left':
            return { top: '5%', left: '6%' }
        case 'top-center':
            return { top: '5%', left: '50%', transform: 'translateX(-50%)' }
        case 'top-right':
            return { top: '5%', right: '6%' }
        case 'center':
            return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
        case 'bottom-left':
            return { bottom: '14%', left: '6%' }
        case 'bottom-center':
            return { bottom: '14%', left: '50%', transform: 'translateX(-50%)' }
        case 'bottom-right':
        default:
            return { bottom: '14%', right: '6%' }
    }
}

function resolveOverlayStyle(item: UiOverlayItem): React.CSSProperties {
    const emphasis = item.emphasis || 'medium'
    const fontSize = emphasis === 'high' ? 34 : emphasis === 'low' ? 20 : 26
    const padding = emphasis === 'high' ? '12px 18px' : '8px 14px'

    return {
        position: 'absolute',
        ...resolveOverlayAnchor(item.position),
        padding,
        borderRadius: item.type === 'reticle' ? '999px' : '14px',
        border: '1px solid rgba(255,255,255,0.28)',
        background: item.type === 'damage'
            ? 'rgba(179, 26, 26, 0.72)'
            : item.type === 'objective'
                ? 'rgba(22, 95, 161, 0.78)'
                : item.type === 'cta'
                    ? 'rgba(15, 122, 92, 0.84)'
                    : 'rgba(10, 12, 22, 0.68)',
        color: item.color || '#f8fafc',
        boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        fontSize,
        fontWeight: emphasis === 'high' ? 800 : 700,
        letterSpacing: '0.02em',
        textShadow: '0 2px 8px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(8px)',
    }
}

const UiOverlayLayer: React.FC<UiOverlayLayerProps> = ({ items }) => {
    return (
        <AbsoluteFill>
            {items.map((item) => (
                <div key={item.id} style={resolveOverlayStyle(item)}>
                    {item.text}
                </div>
            ))}
        </AbsoluteFill>
    )
}

interface EndSlateRendererProps {
    content?: EndSlateContent | null
}

const EndSlateRenderer: React.FC<EndSlateRendererProps> = ({ content }) => {
    return (
        <AbsoluteFill
            style={{
                background: 'radial-gradient(circle at top, rgba(54, 74, 126, 0.55), rgba(8, 10, 18, 1) 62%)',
                color: 'white',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '10%',
                textAlign: 'center',
            }}
        >
            {content?.backgroundUrl ? (
                <Img
                    src={content.backgroundUrl}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        opacity: 0.24,
                    }}
                />
            ) : null}

            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(180deg, rgba(6, 10, 20, 0.18), rgba(6, 10, 20, 0.88))',
                }}
            />

            <div
                style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 18,
                    maxWidth: '78%',
                }}
            >
                {content?.logoUrl ? (
                    <Img
                        src={content.logoUrl}
                        style={{
                            width: 140,
                            height: 140,
                            objectFit: 'contain',
                            filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.35))',
                        }}
                    />
                ) : null}

                <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.05 }}>
                    {content?.title || 'Gameplay Video'}
                </div>

                {content?.tagline ? (
                    <div
                        style={{
                            fontSize: 28,
                            lineHeight: 1.4,
                            color: 'rgba(255,255,255,0.84)',
                        }}
                    >
                        {content.tagline}
                    </div>
                ) : null}

                {content?.cta ? (
                    <div
                        style={{
                            marginTop: 12,
                            padding: '14px 22px',
                            borderRadius: 999,
                            background: 'rgba(20, 184, 166, 0.18)',
                            border: '1px solid rgba(94, 234, 212, 0.38)',
                            color: '#ccfbf1',
                            fontSize: 24,
                            fontWeight: 700,
                            letterSpacing: '0.03em',
                        }}
                    >
                        {content.cta}
                    </div>
                ) : null}
            </div>
        </AbsoluteFill>
    )
}

export default VideoComposition
