'use client'

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import Navbar from '@/components/Navbar'
import { MediaImage } from '@/components/media/MediaImage'
import { AppIcon } from '@/components/ui/icons'
import { apiFetch } from '@/lib/api-fetch'
import type { GameplayVideoProject, GameplayReferenceKind } from '@/types/gameplay-video'
import { Link } from '@/i18n/navigation'
import { useParams } from 'next/navigation'

type GameplayApiResponse = {
  project: {
    id: string
    name: string
    description: string | null
  }
  gameplayVideoData: GameplayVideoProject
}

type EditorResponse = {
  id: string
  gameplayVideoProjectId: string
  projectData: {
    timeline?: unknown[]
    bgmTrack?: unknown[]
  }
  renderStatus: string | null
  renderTaskId: string | null
  outputUrl: string | null
  updatedAt: string
}

type ActionTrace = {
  label: string
  status: 'pending' | 'success' | 'error'
  message: string
  endpoint: string
  requestBody: string | null
  responseBody: string | null
  taskId: string | null
  renderVersionId: string | null
  requestId: string | null
  beatTitle?: string | null
  createdAt: string
}

const REFERENCE_KIND_OPTIONS: GameplayReferenceKind[] = [
  'style',
  'composition',
  'ui',
  'motion',
  'firstFrame',
  'lastFrame',
]

const REFERENCE_KIND_LABELS: Record<GameplayReferenceKind, string> = {
  style: '风格参考',
  composition: '构图参考',
  ui: '界面参考',
  motion: '运动参考',
  firstFrame: '首帧参考',
  lastFrame: '尾帧参考',
}

const FIELD_SHELL_CLASSNAME =
  'rounded-[24px] border border-slate-200/90 bg-white/80 p-4 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.3)] backdrop-blur-sm'
const PANEL_CARD_CLASSNAME =
  'rounded-[28px] border border-slate-200/90 bg-white/80 p-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.28)] backdrop-blur-sm'
const CONTROL_CLASSNAME =
  'glass-input-base min-h-[52px] bg-white/95 px-4 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 placeholder:italic'
const TEXTAREA_CLASSNAME =
  'glass-textarea-base min-h-[124px] bg-white/95 px-4 py-3 text-sm leading-6 font-medium text-slate-900 placeholder:text-slate-400 placeholder:italic app-scrollbar'
const SELECT_CLASSNAME =
  'glass-select-base min-h-[52px] bg-white/95 px-4 py-3 text-sm font-medium text-slate-900'

function getReferenceKindLabel(kind: string) {
  return REFERENCE_KIND_LABELS[kind as GameplayReferenceKind] || kind
}

function getKeyframeKindLabel(kind: string) {
  if (kind === 'first') return '首帧'
  if (kind === 'middle') return '中间帧'
  if (kind === 'last') return '尾帧'
  return kind
}

function getStatusLabel(status: string | null | undefined) {
  if (!status) return '未开始'

  switch (status) {
    case 'idle':
      return '未开始'
    case 'queued':
      return '排队中'
    case 'pending':
      return '等待中'
    case 'processing':
      return '处理中'
    case 'running':
      return '执行中'
    case 'ready':
      return '已就绪'
    case 'selected':
      return '已选中'
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    default:
      return status
  }
}

function getStatusTone(status: string | null | undefined) {
  switch (status) {
    case 'completed':
    case 'selected':
    case 'ready':
      return 'success'
    case 'failed':
      return 'danger'
    case 'processing':
    case 'running':
      return 'info'
    case 'queued':
    case 'pending':
      return 'warning'
    default:
      return 'neutral'
  }
}

function getOverlayTypeLabel(type: string) {
  switch (type) {
    case 'damage':
      return '伤害数值'
    case 'objective':
      return '目标提示'
    case 'cta':
      return '行动号召'
    case 'badge':
      return '标签'
    case 'caption':
      return '字幕'
    case 'reticle':
      return '锁定标记'
    default:
      return type
  }
}

function getActionLabel(key: string) {
  if (key === 'save-brief') return '保存设定'
  if (key === 'add-reference') return '添加参考图'
  if (key === 'generate-beats') return '生成镜头规划'
  if (key === 'generate-voice-all') return '批量生成旁白'
  if (key === 'load-editor') return '同步时间线'
  if (key === 'render') return '提交导出'
  if (key.startsWith('delete-reference-')) return '删除参考图'
  if (key.startsWith('keyframes-')) return '生成关键帧'
  if (key.startsWith('shot-')) return '生成镜头'
  if (key.startsWith('overlay-')) return '生成 UI 叠加'
  if (key.startsWith('voice-')) return '生成旁白'
  if (key.startsWith('select-shot-')) return '选择镜头候选'
  return key
}

function getPayloadRecord(payload: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = payload[key]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function getFriendlyActionErrorMessage(payload: Record<string, unknown>, status: number) {
  const errorRecord = getPayloadRecord(payload, 'error')
  const errorDetails = errorRecord ? getPayloadRecord(errorRecord, 'details') : null
  const prismaCode =
    (typeof payload.prismaCode === 'string' ? payload.prismaCode : null)
    || (errorDetails && typeof errorDetails.prismaCode === 'string' ? errorDetails.prismaCode : null)

  const rawMessage =
    (typeof payload.message === 'string' ? payload.message : null)
    || (errorRecord && typeof errorRecord.message === 'string' ? errorRecord.message : null)
    || `Request failed (${status})`

  if (
    prismaCode === 'P2021'
    || rawMessage.includes('does not exist in the current database')
    || rawMessage.includes('table `gameplay_video_projects` does not exist')
  ) {
    return '数据库结构还没有同步完成，缺少玩法视频相关数据表。请执行 `npx prisma db push`，或者重启 Docker 的 `app` 容器后再重试。'
  }

  if (prismaCode) {
    return `数据库请求失败（${prismaCode}）。请检查 Prisma schema 和当前数据库是否已经同步。`
  }

  return rawMessage
}

function formatJsonPreview(value: unknown) {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    try {
      return JSON.stringify(JSON.parse(trimmed) as unknown, null, 2)
    } catch {
      return trimmed
    }
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export default function GameplayVideoWorkspacePage() {
  const params = useParams<{ projectId?: string }>()
  const projectId = params?.projectId || ''
  const scriptTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [data, setData] = useState<GameplayApiResponse | null>(null)
  const [editor, setEditor] = useState<EditorResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [lastAction, setLastAction] = useState<ActionTrace | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [briefDirty, setBriefDirty] = useState(false)
  const [scriptError, setScriptError] = useState<string | null>(null)
  const [activityLog, setActivityLog] = useState<string[]>([])
  const [showGuide, setShowGuide] = useState(false)
  const [briefForm, setBriefForm] = useState({
    script: '',
    sellingPoints: '',
    coreLoop: '',
    targetAudience: '',
    platforms: '',
    cta: '',
    notes: '',
    visualStyle: '',
    uiStyle: '',
    narratorVoice: '',
    analysisModel: '',
    imageModel: '',
    videoModel: '',
    audioModel: '',
    targetDurationSec: 20,
    aspectRatio: '9:16',
  })
  const [referenceForm, setReferenceForm] = useState({
    kind: 'style' as GameplayReferenceKind,
    title: '',
    imageUrl: '',
    notes: '',
  })

  const loadWorkspace = useCallback(async () => {
    if (!projectId) return

    const [workspaceRes, editorRes] = await Promise.all([
      apiFetch(`/api/gameplay-video/${projectId}`),
      apiFetch(`/api/gameplay-video/${projectId}/editor`),
    ])

    if (!workspaceRes.ok) {
      const message = await workspaceRes.text()
      throw new Error(message || `Failed to load gameplay workspace (${workspaceRes.status})`)
    }

    const workspaceJson = await workspaceRes.json() as GameplayApiResponse
    startTransition(() => {
      setData(workspaceJson)
      setError(null)
    })

    if (!briefDirty) {
      const brief = workspaceJson.gameplayVideoData.brief
      startTransition(() => {
        setBriefForm({
          script: brief?.script || '',
          sellingPoints: (brief?.sellingPoints || []).join('\n'),
          coreLoop: brief?.coreLoop || '',
          targetAudience: brief?.targetAudience || '',
          platforms: (brief?.platforms || []).join(', '),
          cta: brief?.cta || '',
          notes: brief?.notes || '',
          visualStyle: workspaceJson.gameplayVideoData.visualStyle || '',
          uiStyle: workspaceJson.gameplayVideoData.uiStyle || '',
          narratorVoice: workspaceJson.gameplayVideoData.narratorVoice || '',
          analysisModel: workspaceJson.gameplayVideoData.analysisModel || '',
          imageModel: workspaceJson.gameplayVideoData.imageModel || '',
          videoModel: workspaceJson.gameplayVideoData.videoModel || '',
          audioModel: workspaceJson.gameplayVideoData.audioModel || '',
          targetDurationSec: workspaceJson.gameplayVideoData.targetDurationSec || 20,
          aspectRatio: workspaceJson.gameplayVideoData.aspectRatio || '9:16',
        })
      })
    }

    if (editorRes.ok) {
      const editorJson = await editorRes.json() as EditorResponse
      startTransition(() => {
        setEditor(editorJson)
      })
    }
  }, [briefDirty, projectId])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setLoading(true)
      try {
        await loadWorkspace()
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void run()

    const timer = window.setInterval(() => {
      void loadWorkspace().catch(() => undefined)
    }, 5000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [loadWorkspace])

  const totalDuration = useMemo(() => {
    return (data?.gameplayVideoData.beats || []).reduce((sum, beat) => sum + beat.durationSec, 0) + 3
  }, [data?.gameplayVideoData.beats])

  function pushActivity(message: string) {
    setActivityLog((prev) => [message, ...prev].slice(0, 8))
  }

  function focusScriptField() {
    window.requestAnimationFrame(() => {
      scriptTextareaRef.current?.focus()
      scriptTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  function ensureScript(actionLabel: string) {
    if (briefForm.script.trim()) {
      setScriptError(null)
      return true
    }

    const message = `请先填写脚本，再${actionLabel}。`
    setScriptError(message)
    setActionError(message)
    pushActivity(`${actionLabel}: 失败 - ${message}`)
    focusScriptField()
    return false
  }

  function registerActionFailure(params: {
    label: string
    message: string
    endpoint: string
    requestBody?: unknown
    beatTitle?: string | null
  }) {
    setActionError(params.message)
    setLastAction({
      label: params.label,
      status: 'error',
      message: params.message,
      endpoint: params.endpoint,
      requestBody: formatJsonPreview(params.requestBody),
      responseBody: null,
      taskId: null,
      renderVersionId: null,
      requestId: null,
      beatTitle: params.beatTitle || null,
      createdAt: new Date().toISOString(),
    })
    pushActivity(`${params.label}: 失败 - ${params.message}`)
  }

  function ensureModelConfigured(params: {
    actionLabel: string
    endpoint: string
    requestBody?: unknown
    beatTitle?: string | null
    checks: Array<{ value: string | null | undefined; message: string }>
  }) {
    const failedCheck = params.checks.find((item) => !item.value?.trim())
    if (!failedCheck) return true
    registerActionFailure({
      label: params.actionLabel,
      message: failedCheck.message,
      endpoint: params.endpoint,
      requestBody: params.requestBody,
      beatTitle: params.beatTitle,
    })
    return false
  }

  async function runAction(
    key: string,
    url: string,
    options?: RequestInit,
    meta?: { beatTitle?: string | null },
  ) {
    setBusyKey(key)
    const actionLabel = getActionLabel(key)
    const requestBody =
      typeof options?.body === 'string'
        ? options.body
        : options?.body
          ? String(options.body)
          : null

    setLastAction({
      label: actionLabel,
      status: 'pending',
      message: '请求已发出，等待接口返回结果。',
      endpoint: url,
      requestBody: formatJsonPreview(requestBody),
      responseBody: null,
      taskId: null,
      renderVersionId: null,
      requestId: null,
      beatTitle: meta?.beatTitle || null,
      createdAt: new Date().toISOString(),
    })
    try {
      const response = await apiFetch(url, options)
      const payloadText = await response.text()
      let payload: Record<string, unknown> = {}
      if (payloadText) {
        try {
          payload = JSON.parse(payloadText) as Record<string, unknown>
        } catch {
          payload = { message: payloadText }
        }
      }
      if (!response.ok) {
        const message = getFriendlyActionErrorMessage(payload, response.status)
        setActionError(message)
        setLastAction({
          label: actionLabel,
          status: 'error',
          message,
          endpoint: url,
          requestBody: formatJsonPreview(requestBody),
          responseBody: formatJsonPreview(payloadText),
          taskId: null,
          renderVersionId: null,
          requestId: response.headers.get('x-request-id'),
          beatTitle: meta?.beatTitle || null,
          createdAt: new Date().toISOString(),
        })
        pushActivity(`${actionLabel}: 失败 - ${message}`)
        return null
      }

      const taskId = typeof payload.taskId === 'string' ? payload.taskId : null
      const renderVersionId = typeof payload.renderVersionId === 'string' ? payload.renderVersionId : null
      const message = taskId
        ? `${actionLabel}: 已提交任务 ${taskId}`
        : renderVersionId
          ? `${actionLabel}: 已创建导出 ${renderVersionId}`
          : `${actionLabel}: 已完成`
      setActionError(null)
      setLastAction({
        label: actionLabel,
        status: 'success',
        message,
        endpoint: url,
        requestBody: formatJsonPreview(requestBody),
        responseBody: formatJsonPreview(payloadText),
        taskId,
        renderVersionId,
        requestId: response.headers.get('x-request-id'),
        beatTitle: meta?.beatTitle || null,
        createdAt: new Date().toISOString(),
      })
      pushActivity(message)
      await loadWorkspace()
      return payload
    } catch (err) {
      const message = err instanceof Error ? err.message : '请求失败，请稍后重试。'
      setActionError(message)
      setLastAction({
        label: actionLabel,
        status: 'error',
        message,
        endpoint: url,
        requestBody: formatJsonPreview(requestBody),
        responseBody: null,
        taskId: null,
        renderVersionId: null,
        requestId: null,
        beatTitle: meta?.beatTitle || null,
        createdAt: new Date().toISOString(),
      })
      pushActivity(`${actionLabel}: 失败 - ${message}`)
      return null
    } finally {
      setBusyKey(null)
    }
  }

  async function saveBrief() {
    if (!ensureScript('保存设定')) {
      return false
    }

    const result = await runAction('save-brief', `/api/gameplay-video/${projectId}/brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        script: briefForm.script.trim(),
        sellingPoints: briefForm.sellingPoints.split('\n').map((item) => item.trim()).filter(Boolean),
        coreLoop: briefForm.coreLoop,
        targetAudience: briefForm.targetAudience,
        platforms: briefForm.platforms.split(',').map((item) => item.trim()).filter(Boolean),
        cta: briefForm.cta,
        notes: briefForm.notes,
        visualStyle: briefForm.visualStyle,
        uiStyle: briefForm.uiStyle,
        narratorVoice: briefForm.narratorVoice,
        analysisModel: briefForm.analysisModel,
        imageModel: briefForm.imageModel,
        videoModel: briefForm.videoModel,
        audioModel: briefForm.audioModel,
        targetDurationSec: briefForm.targetDurationSec,
        aspectRatio: briefForm.aspectRatio,
      }),
    })
    if (!result) {
      return false
    }

    setScriptError(null)
    setBriefDirty(false)
    return true
  }

  if (!projectId) {
    return null
  }

  return (
    <div className="glass-page min-h-screen">
      <Navbar />
      <GuideModal open={showGuide} onClose={() => setShowGuide(false)} />

      <main className="container mx-auto px-4 py-8">
        <section className="glass-surface overflow-hidden border border-white/10">
          <div
            className="p-8"
            style={{
              background:
                'radial-gradient(circle at top left, rgba(240, 119, 76, 0.22), transparent 32%), linear-gradient(135deg, rgba(12, 18, 31, 0.98), rgba(16, 33, 58, 0.92))',
            }}
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-3xl">
                <div className="mb-3 inline-flex rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs uppercase tracking-[0.28em] text-white/70">
                  玩法视频工作台
                </div>
                <h1 className="text-3xl font-semibold text-white">
                  {data?.project.name || '玩法视频'}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
                  用脚本、竞品参考帧和风格参考，生成 15-30 秒、9:16 的 AI 伪实机玩法片。
                  当前链路包含基础设定、参考图、镜头规划、关键帧、镜头生成、旁白、时间线和导出。
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <ActionButton
                  variant="secondary"
                  help="打开内置的操作说明，快速了解字段、默认值和推荐流程。"
                  onClick={() => setShowGuide(true)}
                >
                  <AppIcon name="bookOpen" className="h-4 w-4" />
                  操作手册
                </ActionButton>
                <Link
                  href={`/workspace/${projectId}`}
                  className="glass-btn-base glass-btn-secondary px-4 py-2 text-sm"
                >
                  返回原工作台
                </Link>
                <ActionButton
                  variant="primary"
                  help="重新请求当前项目的基础设定、镜头规划、时间线和导出状态。"
                  onClick={() => void loadWorkspace()}
                >
                  <AppIcon name="refresh" className="h-4 w-4" />
                  刷新数据
                </ActionButton>
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-4">
              <MetricCard label="参考图数量" value={String(data?.gameplayVideoData.references.length || 0)} />
              <MetricCard label="镜头段落" value={String(data?.gameplayVideoData.beats.length || 0)} />
              <MetricCard label="总时长" value={`${totalDuration || 0}s`} />
              <MetricCard label="最近导出" value={getStatusLabel(data?.gameplayVideoData.renderVersions[0]?.status)} />
            </div>
          </div>
        </section>

        <section className="glass-surface-elevated mt-6 overflow-hidden border border-white/10">
          <div className="grid gap-4 p-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[28px] border border-white/14 bg-[linear-gradient(145deg,rgba(15,23,42,0.92),rgba(30,41,59,0.86))] p-5 text-white shadow-[0_20px_50px_-34px_rgba(15,23,42,0.75)]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white">
                  <AppIcon name="info" className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">默认值与输入样式说明</h2>
                  <p className="mt-1 text-sm text-white/65">
                    灰色斜体代表系统默认值或示例占位，深色正文代表你的实际输入内容。
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <LegendCard
                  title="灰色斜体"
                  description="系统默认值、示例提示或可留空说明。"
                />
                <LegendCard
                  title="深色实字"
                  description="你自己输入或系统已保存到项目里的真实内容。"
                />
                <LegendCard
                  title="右上角标签"
                  description="会告诉你这个字段是建议必填、可留空，还是按步骤需要。"
                />
              </div>
            </div>

            <div className="rounded-[28px] border border-sky-200/70 bg-white/80 p-5 shadow-[0_16px_40px_-30px_rgba(37,99,235,0.28)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                    <AppIcon name="sparkles" className="h-3.5 w-3.5" />
                    第一次使用建议
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-slate-900">照这个顺序点，最稳</h2>
                </div>
                <HelpTip content="这是给第一次上手的同事准备的最短路径。先跑通流程，再慢慢补视觉细节。" />
              </div>
              <ol className="mt-4 grid gap-3 text-sm text-slate-700">
                {[
                  '先填脚本、卖点、视觉风格和目标时长，再点“保存设定”。',
                  '添加 3 到 5 张参考图，至少包含风格参考、构图参考和界面参考。',
                  '先生成镜头规划，再逐个镜头生成关键帧、镜头和 UI 叠加。',
                  '选中每个镜头的最终候选后，再同步时间线并提交导出。',
                ].map((item, index) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <span className="leading-6">{item}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="glass-surface mt-6 p-8 text-center text-sm text-[var(--glass-text-secondary)]">
            加载中...
          </section>
        ) : null}

        {error ? (
          <section className="glass-surface mt-6 border border-red-400/30 p-6 text-sm text-red-200">
            {error}
          </section>
        ) : null}

        {actionError ? (
          <section className="glass-surface mt-6 border border-rose-200 bg-rose-50/92 p-4 shadow-[0_16px_36px_-28px_rgba(225,29,72,0.35)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-rose-700">当前操作没有成功</div>
                <p className="mt-1 text-sm leading-6 text-rose-600">{actionError}</p>
              </div>
              <button
                type="button"
                onClick={() => setActionError(null)}
                className="rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100"
              >
                关闭提示
              </button>
            </div>
          </section>
        ) : null}

        {lastAction ? (
          <section className="glass-surface mt-6 border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.22)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-900">最近一次操作详情</h2>
                  <StatusChip tone={
                    lastAction.status === 'success'
                      ? 'success'
                      : lastAction.status === 'error'
                        ? 'danger'
                        : 'warning'
                  }
                  >
                    {lastAction.status === 'success' ? '成功' : lastAction.status === 'error' ? '失败' : '进行中'}
                  </StatusChip>
                  {lastAction.beatTitle ? <StatusChip tone="info">{lastAction.beatTitle}</StatusChip> : null}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-700">{lastAction.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setLastAction(null)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100"
              >
                收起
              </button>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <MetricRow label="操作名称" value={lastAction.label} />
              <MetricRow label="请求时间" value={new Date(lastAction.createdAt).toLocaleString('zh-CN')} />
              <MetricRow label="接口路径" value={lastAction.endpoint} />
              <MetricRow label="请求 ID" value={lastAction.requestId || '未返回'} />
              <MetricRow label="任务 ID" value={lastAction.taskId || '未返回'} />
              <MetricRow label="导出 ID" value={lastAction.renderVersionId || '未返回'} />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <JsonPanel title="提交参数" value={lastAction.requestBody} emptyText="这次请求没有 body。" />
              <JsonPanel title="返回内容 / 错误详情" value={lastAction.responseBody} emptyText="这次请求没有返回正文。" />
            </div>
          </section>
        ) : null}

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="glass-surface border border-slate-200/70 bg-white/60 p-6 shadow-[0_20px_44px_-34px_rgba(15,23,42,0.22)]">
            <SectionHeader
              title="基础设定"
              description="在这里定义脚本、卖点、默认比例和模型配置。表单已经标出哪些字段可留空。"
              tip="生成镜头规划之前，最少需要保存脚本。其他字段会作为默认值影响后续镜头和旁白生成。"
              action={(
                <ActionButton
                  variant="primary"
                  help="把当前脚本、风格和模型配置保存为项目默认值。后续生成步骤会优先读取这里。"
                  disabled={busyKey === 'save-brief'}
                  onClick={() => void saveBrief()}
                >
                  {busyKey === 'save-brief' ? '保存中...' : '保存设定'}
                </ActionButton>
              )}
            />

            <div className="grid gap-4">
              <FieldBlock
                label="脚本"
                tip="按镜头节奏写脚本，每行一个镜头段落。生成镜头规划时，脚本是必须项。"
                helper="建议一行一个镜头段落。越像广告分镜语言，生成效果越稳定。"
                badgeText="建议必填"
                badgeTone="warning"
              >
                <textarea
                  ref={scriptTextareaRef}
                  value={briefForm.script}
                  onChange={(event) => {
                    if (scriptError && event.target.value.trim()) {
                      setScriptError(null)
                    }
                    setBriefDirty(true)
                    setBriefForm((prev) => ({ ...prev, script: event.target.value }))
                  }}
                  placeholder={'默认示例：主角冲进战场，屏幕出现目标提示。\n释放大招，画面弹出高伤害数字和连击反馈。\n清掉敌人后出现升级按钮和下一关入口。'}
                  className={`${TEXTAREA_CLASSNAME} min-h-[200px]`}
                />
                {scriptError ? (
                  <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                    {scriptError}
                  </p>
                ) : null}
              </FieldBlock>

              <div className="grid gap-4 md:grid-cols-2">
                <InputField
                  label="卖点"
                  value={briefForm.sellingPoints}
                  onChange={(value) => {
                    setBriefDirty(true)
                    setBriefForm((prev) => ({ ...prev, sellingPoints: value }))
                  }}
                  multiline
                  badgeText="建议填写"
                  badgeTone="info"
                  tip="卖点会补充到镜头规划和镜头描述里。建议一行一个卖点。"
                  helper="可留空，但填写后镜头规划会更聚焦。"
                  placeholder={'默认示例：高爆发战斗反馈\n爽快清屏\n升级成长快'}
                  defaultNote="可留空；不填时只按脚本拆镜头。"
                />
                <InputField
                  label="核心循环"
                  value={briefForm.coreLoop}
                  onChange={(value) => {
                    setBriefDirty(true)
                    setBriefForm((prev) => ({ ...prev, coreLoop: value }))
                  }}
                  badgeText="可留空"
                  tip="用于记录玩法主循环，方便团队对齐，不会阻塞当前流程。"
                  helper="更适合写成“接敌 -> 放技能 -> 清场 -> 升级”这种结构。"
                  placeholder="默认示例：接敌 -> 放技能 -> 清场 -> 升级"
                  defaultNote="可留空；当前版本主要用于记录需求。"
                />
                <InputField
                  label="目标人群"
                  value={briefForm.targetAudience}
                  onChange={(value) => {
                    setBriefDirty(true)
                    setBriefForm((prev) => ({ ...prev, targetAudience: value }))
                  }}
                  badgeText="可留空"
                  tip="用于记录目标用户，例如二次元 RPG 用户、休闲策略玩家等。"
                  helper="当前版本不会因为这里留空而阻塞生成。"
                  placeholder="默认：泛移动游戏用户"
                  defaultNote="可留空；当前版本不会阻塞流程。"
                />
                <InputField
                  label="平台"
                  value={briefForm.platforms}
                  onChange={(value) => {
                    setBriefDirty(true)
                    setBriefForm((prev) => ({ ...prev, platforms: value }))
                  }}
                  badgeText="可留空"
                  tip="填写投放或发布平台，例如 iOS、Android、TikTok、B 站。"
                  helper="建议用英文逗号分隔多个平台。"
                  placeholder="默认：不做平台定制，例如 iOS, Android"
                  defaultNote="可留空；不填时不做平台差异化提示。"
                />
                <InputField
                  label="CTA（行动号召）"
                  value={briefForm.cta}
                  onChange={(value) => {
                    setBriefDirty(true)
                    setBriefForm((prev) => ({ ...prev, cta: value }))
                  }}
                  badgeText="可留空"
                  tip="结尾号召文案，例如“立即下载”“马上预约”“进入商店查看”。"
                  helper="会影响尾标和 UI 叠加里的 CTA。"
                  placeholder="默认：预约 / 下载"
                  defaultNote="留空时，尾标会默认使用“预约 / 下载”。"
                />
                <InputField
                  label="旁白音色"
                  value={briefForm.narratorVoice}
                  onChange={(value) => {
                    setBriefDirty(true)
                    setBriefForm((prev) => ({ ...prev, narratorVoice: value }))
                  }}
                  badgeText="按步骤需要"
                  badgeTone="warning"
                  tip="只在生成旁白时才需要。镜头规划、关键帧和镜头生成都不依赖它。"
                  helper="如果还没决定旁白声音，可以先不填，后面再补。"
                  placeholder="默认：留空；生成旁白前再填，例如 cheerful_female_cn"
                  defaultNote="可留空；不填时无法执行“生成旁白”。"
                />
                <InputField
                  label="视觉风格"
                  value={briefForm.visualStyle}
                  onChange={(value) => {
                    setBriefDirty(true)
                    setBriefForm((prev) => ({ ...prev, visualStyle: value }))
                  }}
                  badgeText="可留空"
                  tip="会影响关键帧和镜头生成的整体画面方向，例如“亮色、锐利、偏手游广告”。"
                  helper="越具体越好，建议描述材质、饱和度、镜头气质。"
                  placeholder="默认：清晰、锐利、手游广告感"
                  defaultNote="留空时，系统会用通用的伪实机手游广告风格。"
                />
                <InputField
                  label="UI 风格"
                  value={briefForm.uiStyle}
                  onChange={(value) => {
                    setBriefDirty(true)
                    setBriefForm((prev) => ({ ...prev, uiStyle: value }))
                  }}
                  badgeText="可留空"
                  tip="会影响镜头描述里的 HUD、按钮和数值反馈风格。"
                  helper="建议描述按钮、数值、血条、技能图标是否要强反馈。"
                  placeholder="默认：现代手游 HUD、按钮清楚、数值反馈明显"
                  defaultNote="留空时，系统会使用通用手游 HUD 方向。"
                />
                <InputField
                  label="分析模型"
                  value={briefForm.analysisModel}
                  onChange={(value) => {
                    setBriefDirty(true)
                    setBriefForm((prev) => ({ ...prev, analysisModel: value }))
                  }}
                  badgeText="可留空"
                  tip="预留给后续更复杂的分析链路。当前版本生成镜头规划主要走本地规则，不强依赖它。"
                  helper="如果你已经有常用分析模型，可以先填；不填也能生成镜头规划。"
                  placeholder="默认：当前版本可留空"
                  defaultNote="可留空；当前版本生成镜头规划不强依赖它。"
                />
                <InputField
                  label="图片模型"
                  value={briefForm.imageModel}
                  onChange={(value) => {
                    setBriefDirty(true)
                    setBriefForm((prev) => ({ ...prev, imageModel: value }))
                  }}
                  badgeText="按步骤需要"
                  badgeTone="warning"
                  tip="只在“生成关键帧”时才需要。"
                  helper="如果暂时只想先写脚本和参考图，可以先不填。"
                  placeholder="默认：留空；生成关键帧时再填"
                  defaultNote="可留空；不填时无法执行“生成关键帧”。"
                />
                <InputField
                  label="视频模型"
                  value={briefForm.videoModel}
                  onChange={(value) => {
                    setBriefDirty(true)
                    setBriefForm((prev) => ({ ...prev, videoModel: value }))
                  }}
                  badgeText="按步骤需要"
                  badgeTone="warning"
                  tip="只在“生成镜头”时才需要。"
                  helper="镜头生成前补上即可。"
                  placeholder="默认：留空；生成镜头时再填"
                  defaultNote="可留空；不填时无法执行“生成镜头”。"
                />
                <InputField
                  label="音频模型"
                  value={briefForm.audioModel}
                  onChange={(value) => {
                    setBriefDirty(true)
                    setBriefForm((prev) => ({ ...prev, audioModel: value }))
                  }}
                  badgeText="按步骤需要"
                  badgeTone="warning"
                  tip="只在“生成旁白”时才需要。"
                  helper="如果今天只做无声分镜，可以先不填。"
                  placeholder="默认：留空；生成旁白时再填"
                  defaultNote="可留空；不填时无法执行“生成旁白”。"
                />
                <InputField
                  label="目标时长（秒）"
                  value={String(briefForm.targetDurationSec)}
                  onChange={(value) => {
                    setBriefDirty(true)
                    const nextDuration = Number.parseInt(value, 10)
                    setBriefForm((prev) => ({
                      ...prev,
                      targetDurationSec: Number.isFinite(nextDuration) ? nextDuration : prev.targetDurationSec,
                    }))
                  }}
                  badgeText="默认已填"
                  badgeTone="success"
                  tip="整条视频的目标时长。当前系统会自动预留约 3 秒给尾标。"
                  helper="推荐 15 到 30 秒。默认值已经写在框内。"
                  placeholder="默认：20"
                  defaultNote="默认是 20 秒；如果你清空后不修改，仍会按 20 秒处理。"
                  inputMode="numeric"
                />
                <SelectField
                  label="画面比例"
                  value={briefForm.aspectRatio}
                  onChange={(value) => {
                    setBriefDirty(true)
                    setBriefForm((prev) => ({ ...prev, aspectRatio: value }))
                  }}
                  options={[
                    { value: '9:16', label: '9:16 竖屏' },
                    { value: '16:9', label: '16:9 横屏' },
                  ]}
                  badgeText="默认已填"
                  badgeTone="success"
                  tip="当前 V1 最推荐先做 9:16。横屏可以做，但建议等母版跑通后再切。"
                  helper="默认值已经直接选好。"
                  defaultNote="默认是 9:16。"
                />
                <InputField
                  label="备注"
                  value={briefForm.notes}
                  onChange={(value) => {
                    setBriefDirty(true)
                    setBriefForm((prev) => ({ ...prev, notes: value }))
                  }}
                  multiline
                  badgeText="可留空"
                  tip="记录特殊要求，例如“角色必须偏卡通”“镜头不要出现写实真人感”。"
                  helper="适合写附加要求或审片注意事项。"
                  placeholder="默认：留空；可写补充要求或禁止项"
                  defaultNote="可留空；当前版本主要用于记录需求。"
                />
              </div>
            </div>
          </section>

          <section className="glass-surface border border-slate-200/70 bg-white/60 p-6 shadow-[0_20px_44px_-34px_rgba(15,23,42,0.22)]">
            <SectionHeader
              title="参考图面板"
              description="添加竞品帧、构图参考、UI 参考或首尾帧参考。灰色斜体是默认说明，不是你输入的内容。"
              tip="参考图越像你想要的最终画面，关键帧和镜头生成越稳定。建议至少准备风格参考、构图参考和界面参考。"
            />

            <div className="grid gap-4">
              <SelectField
                label="参考类型"
                value={referenceForm.kind}
                onChange={(value) => setReferenceForm((prev) => ({
                  ...prev,
                  kind: value as GameplayReferenceKind,
                }))}
                options={REFERENCE_KIND_OPTIONS.map((kind) => ({
                  value: kind,
                  label: getReferenceKindLabel(kind),
                }))}
                badgeText="默认已选"
                badgeTone="success"
                tip="默认是“风格参考”。如果这张图主要用于界面、构图或镜头首尾，请切换类型。"
                helper="参考类型会影响系统如何理解这张图。"
                defaultNote="默认类型是“风格参考”。"
              />
              <InputField
                label="标题"
                value={referenceForm.title}
                onChange={(value) => setReferenceForm((prev) => ({ ...prev, title: value }))}
                badgeText="可留空"
                tip="给这张参考图起一个好认的名字，方便后面团队回看。"
                helper="例如：竞品战斗首帧、卡牌结算 UI、韩式卡通角色参考。"
                placeholder="默认示例：竞品战斗首帧"
                defaultNote="可留空；不填时列表会显示“未命名参考图”。"
              />
              <InputField
                label="图片链接"
                value={referenceForm.imageUrl}
                onChange={(value) => setReferenceForm((prev) => ({ ...prev, imageUrl: value }))}
                badgeText="建议必填"
                badgeTone="warning"
                tip="当前版本读取的是图片 URL，不是本地拖拽上传。"
                helper="请填一条可访问的公开图片链接。"
                placeholder="默认示例：https://example.com/reference-frame.png"
              />
              <InputField
                label="备注"
                value={referenceForm.notes}
                onChange={(value) => setReferenceForm((prev) => ({ ...prev, notes: value }))}
                multiline
                badgeText="可留空"
                tip="可以写这张图为什么好、主体在哪、希望保留什么 UI，方便系统理解。"
                helper="备注越具体，越利于团队协作。"
                placeholder="默认示例：主体置中，暖色战斗氛围，顶部保留伤害数字，底部留字幕安全区。"
                defaultNote="可留空；建议写清主体位置和 UI 要点。"
              />
              <div className="flex flex-wrap gap-3">
                <ActionButton
                  variant="primary"
                  help="把当前参考图表单添加到项目参考池。"
                  disabled={busyKey === 'add-reference'}
                  onClick={() => void (async () => {
                    await runAction('add-reference', `/api/gameplay-video/${projectId}/references`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(referenceForm),
                    })
                    setReferenceForm({
                      kind: 'style',
                      title: '',
                      imageUrl: '',
                      notes: '',
                    })
                  })()}
                >
                  {busyKey === 'add-reference' ? '提交中...' : '添加参考图'}
                </ActionButton>
              </div>
            </div>

            <div className="mt-6 grid gap-3">
              {(data?.gameplayVideoData.references || []).map((reference) => (
                <div key={reference.id} className={FIELD_SHELL_CLASSNAME}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold tracking-[0.18em] text-sky-700">
                        {getReferenceKindLabel(reference.kind)}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {reference.title || '未命名参考图'}
                      </div>
                    </div>
                    <ActionButton
                      variant="danger"
                      size="sm"
                      help="从当前项目里移除这张参考图，不会影响你本地原始图片。"
                      onClick={() => void runAction(
                        `delete-reference-${reference.id}`,
                        `/api/gameplay-video/${projectId}/references?referenceId=${reference.id}`,
                        { method: 'DELETE' },
                      )}
                    >
                      删除
                    </ActionButton>
                  </div>
                  {reference.notes ? (
                    <p className="mt-3 text-sm leading-6 text-slate-600">{reference.notes}</p>
                  ) : null}
                  {reference.imageUrl ? (
                    <MediaImage
                      src={reference.imageUrl}
                      alt={reference.title || reference.kind}
                      className="mt-3 h-36 w-full rounded-2xl border border-slate-200 object-cover"
                      width={640}
                      height={360}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="glass-surface mt-6 border border-slate-200/70 bg-white/60 p-6 shadow-[0_20px_44px_-34px_rgba(15,23,42,0.22)]">
          <SectionHeader
            title="镜头规划"
            description="先生成镜头规划，再逐个补关键帧、镜头、UI 叠加与旁白。每个按钮右边的问号都能看到功能解释。"
            tip="镜头规划是整条片子的骨架。生成完以后，请逐个镜头检查意图、时长和描述是否合理。"
            action={(
              <div className="flex flex-wrap gap-3">
                <ActionButton
                  variant="primary"
                  help="根据脚本、卖点、参考图和时长，把整条视频拆成多个镜头段落。"
                  onClick={() => void (async () => {
                    if (!ensureScript('生成镜头规划')) {
                      return
                    }
                    if (briefDirty) {
                      const saved = await saveBrief()
                      if (!saved) {
                        return
                      }
                    }
                    await runAction('generate-beats', `/api/gameplay-video/${projectId}/beats/generate`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ analysisModel: briefForm.analysisModel || null }),
                    })
                  })()}
                >
                  生成镜头规划
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  help="对所有已有旁白文案的镜头一次性生成语音。需要提前填好旁白音色和音频模型。"
                  onClick={() => void runAction('generate-voice-all', `/api/gameplay-video/${projectId}/voice/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      beatIds: [],
                      narratorVoice: briefForm.narratorVoice || null,
                      audioModel: briefForm.audioModel || null,
                    }),
                  })}
                >
                  批量生成旁白
                </ActionButton>
              </div>
            )}
          />

          <div className="mt-6 grid gap-4">
            {(data?.gameplayVideoData.beats || []).map((beat) => (
              <article
                key={beat.id}
                className={PANEL_CARD_CLASSNAME}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-white">
                        镜头 {beat.orderIndex + 1}
                      </span>
                      <StatusChip tone="info">{beat.archetype || '核心展示'}</StatusChip>
                      <StatusChip tone="neutral">{beat.durationSec}s</StatusChip>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-slate-900">{beat.intent}</h3>
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/85 p-4">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        镜头描述
                        <HelpTip content="这段描述是系统为当前镜头整理出的生成提示词，会用于后续关键帧和镜头生成。" />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {beat.shotPrompt || '尚未生成镜头描述'}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {(beat.uiNeeds || []).map((uiNeed) => (
                        <StatusChip key={uiNeed} tone="warning">{uiNeed}</StatusChip>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end">
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      help="先生成镜头首帧和尾帧，适合需要稳定控制动作衔接的镜头。"
                      onClick={() => {
                        const endpoint = `/api/gameplay-video/${projectId}/beats/${beat.id}/keyframes/generate`
                        const requestBody = {
                          kinds: ['first', 'last'],
                          imageModel: briefForm.imageModel || null,
                        }
                        if (!ensureModelConfigured({
                          actionLabel: '生成关键帧',
                          endpoint,
                          requestBody,
                          beatTitle: `镜头 ${beat.orderIndex + 1}`,
                          checks: [
                            {
                              value: briefForm.imageModel,
                              message: '还没有配置图片模型，所以关键帧任务不会成功。请先在基础设定里填写“图片模型”。',
                            },
                          ],
                        })) {
                          return
                        }
                        void runAction(
                          `keyframes-${beat.id}`,
                          endpoint,
                          {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(requestBody),
                          },
                          { beatTitle: `镜头 ${beat.orderIndex + 1}` },
                        )
                      }}
                    >
                      {busyKey === `keyframes-${beat.id}` ? '提交中...' : '生成关键帧'}
                    </ActionButton>
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      help="正式生成当前镜头的视频片段。需要先准备好视频模型。"
                      onClick={() => {
                        const endpoint = `/api/gameplay-video/${projectId}/beats/${beat.id}/shot/generate`
                        const requestBody = {
                          variantCount: 1,
                          imageModel: briefForm.imageModel || null,
                          videoModel: briefForm.videoModel || null,
                          generationMode: beat.generationMode,
                        }
                        if (!ensureModelConfigured({
                          actionLabel: '生成镜头',
                          endpoint,
                          requestBody,
                          beatTitle: `镜头 ${beat.orderIndex + 1}`,
                          checks: [
                            {
                              value: briefForm.imageModel,
                              message: '还没有配置图片模型，所以镜头生成不会成功。请先在基础设定里填写“图片模型”。',
                            },
                            {
                              value: briefForm.videoModel,
                              message: '还没有配置视频模型，所以镜头生成不会成功。请先在基础设定里填写“视频模型”。',
                            },
                          ],
                        })) {
                          return
                        }
                        void runAction(
                          `shot-${beat.id}`,
                          endpoint,
                          {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(requestBody),
                          },
                          { beatTitle: `镜头 ${beat.orderIndex + 1}` },
                        )
                      }}
                    >
                      {busyKey === `shot-${beat.id}` ? '提交中...' : '生成镜头'}
                    </ActionButton>
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      help="给当前镜头生成广告感更强的 UI 叠加，例如伤害数值、目标提示和 CTA。"
                      onClick={() => void runAction(
                        `overlay-${beat.id}`,
                        `/api/gameplay-video/${projectId}/ui-overlay/compose`,
                        {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ beatId: beat.id }),
                        },
                        { beatTitle: `镜头 ${beat.orderIndex + 1}` },
                      )}
                    >
                      {busyKey === `overlay-${beat.id}` ? '提交中...' : '生成 UI 叠加'}
                    </ActionButton>
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      help="只为当前镜头生成旁白语音。需要提前配置旁白音色和音频模型。"
                      onClick={() => {
                        const endpoint = `/api/gameplay-video/${projectId}/voice/generate`
                        const requestBody = {
                          beatIds: [beat.id],
                          narratorVoice: briefForm.narratorVoice || null,
                          audioModel: briefForm.audioModel || null,
                        }
                        if (!ensureModelConfigured({
                          actionLabel: '生成旁白',
                          endpoint,
                          requestBody,
                          beatTitle: `镜头 ${beat.orderIndex + 1}`,
                          checks: [
                            {
                              value: briefForm.narratorVoice,
                              message: '还没有填写旁白音色，所以旁白生成不会成功。请先在基础设定里填写“旁白音色”。',
                            },
                            {
                              value: briefForm.audioModel,
                              message: '还没有配置音频模型，所以旁白生成不会成功。请先在基础设定里填写“音频模型”。',
                            },
                          ],
                        })) {
                          return
                        }
                        void runAction(
                          `voice-${beat.id}`,
                          endpoint,
                          {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(requestBody),
                          },
                          { beatTitle: `镜头 ${beat.orderIndex + 1}` },
                        )
                      }}
                    >
                      {busyKey === `voice-${beat.id}` ? '提交中...' : '生成旁白'}
                    </ActionButton>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-3">
                  <div className={FIELD_SHELL_CLASSNAME}>
                    <SubsectionTitle
                      title="关键帧"
                      tip="先看首帧和尾帧是否符合预期，再决定要不要继续生成镜头。"
                    />
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      {beat.keyframes.map((keyframe) => (
                        <div key={keyframe.id} className="rounded-2xl border border-slate-200 bg-slate-50/90 p-3">
                          <div className="text-xs font-semibold text-slate-500">{getKeyframeKindLabel(keyframe.kind)}</div>
                          {keyframe.imageUrl ? (
                            <MediaImage
                              src={keyframe.imageUrl}
                              alt={keyframe.kind}
                              className="mt-2 h-28 w-full rounded-xl border border-slate-200 object-cover"
                              width={640}
                              height={360}
                            />
                          ) : (
                            <div className="mt-2 flex h-28 items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">
                              排队中
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={FIELD_SHELL_CLASSNAME}>
                    <SubsectionTitle
                      title="镜头候选"
                      tip="每个候选镜头都可以单独预览。只有被选中的那一条会进入最终时间线。"
                    />
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      {beat.shots.map((shot) => (
                        <div key={shot.id} className="rounded-2xl border border-slate-200 bg-slate-50/90 p-3">
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>v{shot.variantIndex + 1}</span>
                            <StatusChip tone={getStatusTone(shot.status)}>{getStatusLabel(shot.status)}</StatusChip>
                          </div>
                          {shot.videoUrl ? (
                            <video
                              src={shot.videoUrl}
                              controls
                              className="mt-2 h-28 w-full rounded-xl border border-slate-200 object-cover"
                            />
                          ) : (
                            <div className="mt-2 flex h-28 items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">
                              {getStatusLabel(shot.status)}
                            </div>
                          )}
                          <div className="mt-3">
                            <ActionButton
                              size="sm"
                              variant={beat.selectedShotId === shot.id ? 'primary' : 'secondary'}
                              help="把当前镜头候选设置为最终版本。同步时间线后，它才会进入导出结果。"
                              onClick={() => void runAction(
                                `select-shot-${shot.id}`,
                                `/api/gameplay-video/${projectId}/beats/${beat.id}/shot/select`,
                                {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ shotId: shot.id }),
                                },
                              )}
                            >
                              {beat.selectedShotId === shot.id ? '已选中' : '设为当前镜头'}
                            </ActionButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={FIELD_SHELL_CLASSNAME}>
                    <SubsectionTitle
                      title="旁白 / 叠加层"
                      tip="这里汇总当前镜头的字幕、旁白和 UI 叠加结果，方便快速检查是否缺项。"
                    />
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
                      <div className="text-sm text-slate-700">
                        <span className="font-semibold text-slate-900">字幕：</span>
                        {beat.subtitleText || '未设置'}
                      </div>
                      <div className="mt-2 text-sm text-slate-700">
                        <span className="font-semibold text-slate-900">旁白：</span>
                        {beat.voiceoverText || '未设置'}
                      </div>
                      <div className="mt-2 text-sm text-slate-700">
                        <span className="font-semibold text-slate-900">音频：</span>
                        {beat.voiceoverAudioUrl ? '已生成' : '未生成'}
                      </div>
                      <div className="mt-4 grid gap-2">
                        {(beat.overlaySpec || []).map((overlay) => (
                          <div
                            key={overlay.id}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                          >
                            {getOverlayTypeLabel(overlay.type)} · {overlay.text}
                          </div>
                        ))}
                        {!beat.overlaySpec?.length ? (
                          <div className="text-xs italic text-slate-400">尚未生成 UI 叠加</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))}

            {data?.gameplayVideoData.beats.length === 0 ? (
              <div className={PANEL_CARD_CLASSNAME}>
                <div className="flex items-start gap-3 text-sm text-slate-700">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
                    <AppIcon name="info" className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">还没有镜头规划</div>
                    <p className="mt-1 leading-6">
                      先保存基础设定，再点击“生成 Beats”。生成后，你会看到每个镜头的时长、意图和后续操作按钮。
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="glass-surface mt-6 border border-slate-200/70 bg-white/60 p-6 shadow-[0_20px_44px_-34px_rgba(15,23,42,0.22)]">
          <SectionHeader
            title="时间线 / 导出"
            description="当前编辑器会自动把已选中镜头、旁白、字幕和尾标拼成导出用时间线。"
            tip="改完镜头选择、旁白或 UI 叠加后，建议先同步时间线，再提交导出。"
            action={(
              <div className="flex flex-wrap gap-3">
                <ActionButton
                  variant="secondary"
                  help="重新把已选中的镜头、旁白、字幕和尾标拼成导出时间线。"
                  onClick={() => void runAction('load-editor', `/api/gameplay-video/${projectId}/editor`)}
                >
                  同步时间线
                </ActionButton>
                <ActionButton
                  variant="primary"
                  help="提交正式导出任务。导出结果会显示在下方“导出记录”里。"
                  onClick={() => void runAction('render', `/api/gameplay-video/${projectId}/render`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                  })}
                >
                  提交导出
                </ActionButton>
              </div>
            )}
          />

          <div className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className={PANEL_CARD_CLASSNAME}>
              <SubsectionTitle
                title="时间线快照"
                tip="这里是导出前的汇总状态，不是完整 NLE。主要用来确认镜头、轨道和导出状态是否齐全。"
              />
              <div className="mt-4 grid gap-3">
                <MetricRow label="时间线片段数" value={String(editor?.projectData.timeline?.length || 0)} />
                <MetricRow label="BGM 轨道数" value={String(editor?.projectData.bgmTrack?.length || 0)} />
                <MetricRow label="导出状态" value={getStatusLabel(editor?.renderStatus)} />
                <MetricRow label="输出结果" value={editor?.outputUrl ? '已生成' : '暂无'} />
              </div>
              {editor?.outputUrl ? (
                <video
                  src={editor.outputUrl}
                  controls
                  className="mt-4 h-56 w-full rounded-2xl border border-slate-200 object-cover"
                />
              ) : (
                <div className="mt-4 flex h-56 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/85 text-sm italic text-slate-400">
                  还没有可预览的导出结果
                </div>
              )}
            </div>

            <div className={PANEL_CARD_CLASSNAME}>
              <SubsectionTitle
                title="导出记录"
                tip="每次提交导出都会生成一条记录。成功后可以直接在这里预览结果。"
              />
              <div className="mt-4 grid gap-3">
                {(data?.gameplayVideoData.renderVersions || []).map((renderVersion) => (
                  <div key={renderVersion.id} className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{renderVersion.id}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {renderVersion.language} · {renderVersion.aspectRatio}
                        </div>
                      </div>
                      <StatusChip tone={getStatusTone(renderVersion.status)}>
                        {getStatusLabel(renderVersion.status)}
                      </StatusChip>
                    </div>
                    {renderVersion.errorMessage ? (
                      <p className="mt-2 text-sm text-red-600">{renderVersion.errorMessage}</p>
                    ) : null}
                    {renderVersion.outputUrl ? (
                      <video
                        src={renderVersion.outputUrl}
                        controls
                        className="mt-3 h-40 w-full rounded-xl border border-slate-200 object-cover"
                      />
                    ) : null}
                  </div>
                ))}

                {data?.gameplayVideoData.renderVersions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/85 px-4 py-5 text-sm italic text-slate-400">
                    还没有导出记录。
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="glass-surface mt-6 border border-slate-200/70 bg-white/60 p-6 shadow-[0_20px_44px_-34px_rgba(15,23,42,0.22)]">
          <SectionHeader
            title="最近活动"
            description="这里会记录你刚刚触发过的关键操作，方便你快速确认任务是否真的发出去了。"
            tip="如果你点了按钮却不确定有没有生效，可以先看这里有没有新增记录。"
          />
          <div className="mt-4 grid gap-2">
            {activityLog.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/85 px-4 py-5 text-sm italic text-slate-400">
                暂无活动记录。
              </div>
            ) : activityLog.map((entry, index) => (
              <div
                key={`${entry}-${index}`}
                className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.28)]"
              >
                {entry}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

type SectionHeaderProps = {
  title: string
  description: string
  tip: string
  action?: ReactNode
}

function SectionHeader(props: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-slate-900">{props.title}</h2>
          <HelpTip content={props.tip} />
        </div>
        <p className="mt-1 text-sm leading-6 text-slate-600">{props.description}</p>
      </div>
      {props.action ? <div className="flex flex-wrap gap-3">{props.action}</div> : null}
    </div>
  )
}

type FieldBlockProps = {
  label: string
  tip: string
  helper: string
  children: ReactNode
  badgeText?: string
  badgeTone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
  defaultNote?: string
}

function FieldBlock(props: FieldBlockProps) {
  return (
    <div className={FIELD_SHELL_CLASSNAME}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-slate-900">{props.label}</label>
            <HelpTip content={props.tip} />
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">{props.helper}</p>
        </div>
        {props.badgeText ? <StatusChip tone={props.badgeTone || 'neutral'}>{props.badgeText}</StatusChip> : null}
      </div>
      <div className="mt-3">{props.children}</div>
      {props.defaultNote ? (
        <p className="mt-2 text-[11px] italic leading-5 text-slate-400">留空时：{props.defaultNote}</p>
      ) : null}
    </div>
  )
}

type InputFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  tip: string
  helper: string
  defaultNote?: string
  badgeText?: string
  badgeTone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
  multiline?: boolean
  inputMode?: 'text' | 'numeric' | 'email' | 'search' | 'tel' | 'url' | 'none' | 'decimal'
}

function InputField(props: InputFieldProps) {
  return (
    <FieldBlock
      label={props.label}
      tip={props.tip}
      helper={props.helper}
      badgeText={props.badgeText}
      badgeTone={props.badgeTone}
      defaultNote={props.defaultNote}
    >
      {props.multiline ? (
        <textarea
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder={props.placeholder}
          className={TEXTAREA_CLASSNAME}
        />
      ) : (
        <input
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder={props.placeholder}
          inputMode={props.inputMode}
          className={CONTROL_CLASSNAME}
        />
      )}
    </FieldBlock>
  )
}

type SelectFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  tip: string
  helper: string
  defaultNote?: string
  badgeText?: string
  badgeTone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}

function SelectField(props: SelectFieldProps) {
  return (
    <FieldBlock
      label={props.label}
      tip={props.tip}
      helper={props.helper}
      badgeText={props.badgeText}
      badgeTone={props.badgeTone}
      defaultNote={props.defaultNote}
    >
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className={SELECT_CLASSNAME}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldBlock>
  )
}

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  help: string
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'md' | 'sm'
}

function ActionButton(props: ActionButtonProps) {
  const {
    help,
    children,
    variant = 'secondary',
    size = 'md',
    className,
    type,
    ...buttonProps
  } = props
  const variantClassName =
    variant === 'primary'
      ? 'glass-btn-primary'
      : variant === 'danger'
        ? 'glass-btn-danger'
        : 'glass-btn-secondary'
  const sizeClassName = size === 'sm' ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'

  return (
    <div className="inline-flex items-center gap-2">
      <button
        {...buttonProps}
        type={type || 'button'}
        className={`glass-btn-base ${variantClassName} ${sizeClassName} ${className || ''}`}
      >
        {children}
      </button>
      <HelpTip content={help} />
    </div>
  )
}

function HelpTip(props: { content: ReactNode }) {
  return (
    <button
      type="button"
      aria-label="查看说明"
      className="group relative inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
    >
      <AppIcon name="info" className="h-3.5 w-3.5" />
      <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-64 -translate-x-1/2 rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2 text-left text-[11px] leading-5 text-white shadow-[0_20px_40px_-24px_rgba(15,23,42,0.7)] group-hover:block group-focus-visible:block">
        {props.content}
      </span>
    </button>
  )
}

function LegendCard(props: { title: string; description: string }) {
  return (
    <div className="rounded-[22px] border border-white/12 bg-white/8 p-4">
      <div className="text-sm font-semibold text-white">{props.title}</div>
      <p className="mt-2 text-xs leading-5 text-white/65">{props.description}</p>
    </div>
  )
}

function SubsectionTitle(props: { title: string; tip: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{props.title}</div>
      <HelpTip content={props.tip} />
    </div>
  )
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-white/12 bg-white/8 px-5 py-4">
      <div className="text-xs uppercase tracking-[0.18em] text-white/55">{props.label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{props.value}</div>
    </div>
  )
}

function MetricRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
      <span className="text-sm text-slate-500">{props.label}</span>
      <span className="max-w-[60%] break-all text-right text-sm font-semibold text-slate-900">{props.value}</span>
    </div>
  )
}

function JsonPanel(props: { title: string; value: string | null; emptyText: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/85 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{props.title}</div>
      {props.value ? (
        <pre className="mt-3 max-h-72 overflow-auto rounded-2xl border border-slate-200 bg-white p-3 text-xs leading-6 text-slate-700">
          {props.value}
        </pre>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm italic text-slate-400">
          {props.emptyText}
        </div>
      )}
    </div>
  )
}

function StatusChip(props: {
  children: ReactNode
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}) {
  const className =
    props.tone === 'info'
      ? 'bg-sky-50 text-sky-700 border-sky-200'
      : props.tone === 'success'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : props.tone === 'warning'
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : props.tone === 'danger'
            ? 'bg-rose-50 text-rose-700 border-rose-200'
            : 'bg-slate-100 text-slate-700 border-slate-200'

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${className}`}>
      {props.children}
    </span>
  )
}

function GuideModal(props: { open: boolean; onClose: () => void }) {
  if (!props.open) return null

  return (
    <div
      className="glass-overlay fixed inset-0 z-[1100] flex items-center justify-center p-4"
      onClick={props.onClose}
    >
      <div
        className="glass-surface-modal max-h-[88vh] w-full max-w-4xl overflow-y-auto border border-slate-200/80 bg-white/95 p-6 shadow-[0_30px_80px_-36px_rgba(15,23,42,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
              <AppIcon name="bookOpen" className="h-3.5 w-3.5" />
              操作说明
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">玩法视频工作台怎么用</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              先填基础设定，再补参考图，再生成镜头规划，最后逐个镜头做关键帧、镜头、旁白和导出。
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="glass-btn-base glass-btn-secondary h-10 w-10 rounded-full"
          >
            <AppIcon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className={PANEL_CARD_CLASSNAME}>
            <div className="flex items-center gap-2 text-slate-900">
              <AppIcon name="sparkles" className="h-4 w-4 text-sky-600" />
              <h3 className="text-base font-semibold">推荐流程</h3>
            </div>
            <ol className="mt-4 grid gap-3 text-sm text-slate-700">
              {[
                '先写脚本，脚本建议一行一个镜头段落。',
                '添加 3 到 5 张参考图，至少包含风格、构图和界面。',
                '点击“生成 Beats”，检查每个镜头的时长和意图。',
                '逐个镜头生成关键帧、镜头和 UI 叠加。',
                '选中每个镜头的最终候选，再生成旁白。',
                '同步时间线后，提交导出。',
              ].map((item, index) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <span className="leading-6">{item}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className={PANEL_CARD_CLASSNAME}>
            <div className="flex items-center gap-2 text-slate-900">
              <AppIcon name="info" className="h-4 w-4 text-sky-600" />
              <h3 className="text-base font-semibold">默认值规则</h3>
            </div>
            <div className="mt-4 grid gap-3 text-sm text-slate-700">
              <GuideRule title="灰色斜体" description="代表默认值或示例占位，不是你真实输入的内容。" />
              <GuideRule title="目标时长" description="默认 20 秒；系统会自动预留约 3 秒给尾标。" />
              <GuideRule title="画面比例" description="默认 9:16；先把竖屏母版跑通，再考虑做横屏。" />
              <GuideRule title="CTA" description="留空时，尾标默认会使用“预约 / 下载”。" />
              <GuideRule title="图片 / 视频 / 音频模型" description="不需要一上来全填，只要在对应步骤执行前补齐即可。" />
            </div>
          </div>

          <div className={PANEL_CARD_CLASSNAME}>
            <div className="flex items-center gap-2 text-slate-900">
              <AppIcon name="alert" className="h-4 w-4 text-amber-600" />
              <h3 className="text-base font-semibold">常见失败原因</h3>
            </div>
            <div className="mt-4 grid gap-3 text-sm text-slate-700">
              <GuideRule title="生成不了镜头规划" description="通常是脚本没有填写或没有保存设定。" />
              <GuideRule title="生成关键帧失败" description="通常是图片模型没有填，或者图片服务没配置。" />
              <GuideRule title="生成镜头失败" description="通常是视频模型没有填，或者前置关键帧不完整。" />
              <GuideRule title="生成旁白失败" description="通常是旁白音色或音频模型没填。" />
              <GuideRule title="导出结果少镜头" description="通常是某个镜头没有选中最终候选，或者没有同步时间线。" />
            </div>
          </div>

          <div className={PANEL_CARD_CLASSNAME}>
            <div className="flex items-center gap-2 text-slate-900">
              <AppIcon name="idea" className="h-4 w-4 text-sky-600" />
              <h3 className="text-base font-semibold">给运营同事的建议</h3>
            </div>
            <div className="mt-4 grid gap-3 text-sm text-slate-700">
              <GuideRule title="脚本怎么写" description="多写玩法动作和反馈，少写空泛口号。" />
              <GuideRule title="参考图怎么给" description="最好同时给风格图、构图图和界面图。" />
              <GuideRule title="什么时候先出样" description="只要镜头规划、关键帧和镜头能看，就可以先出静态样或静音样。" />
              <GuideRule title="问号提示" description="页面里每个关键字段和按钮右边都有问号，悬停就能看到作用说明。" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function GuideRule(props: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/85 p-4">
      <div className="text-sm font-semibold text-slate-900">{props.title}</div>
      <p className="mt-1 text-sm leading-6 text-slate-600">{props.description}</p>
    </div>
  )
}
