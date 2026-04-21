import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { calculateTimelineDuration } from '@/features/video-editor/utils/time-utils'
import { uploadVideoSourceToCos } from '@/lib/workers/utils'
import { loadGameplayEditorProject } from './service'

const execFileAsync = promisify(execFile)

const REMOTION_ENTRY = path.join(
  process.cwd(),
  'src/features/video-editor/remotion/gameplay-render-root.tsx',
)

export async function renderGameplayVideoToStorage(params: {
  projectId: string
  renderVersionId: string
}) {
  const { projectData } = await loadGameplayEditorProject(params.projectId)
  const durationInFrames = Math.max(1, calculateTimelineDuration(projectData.timeline))
  const tempDir = path.join(os.tmpdir(), 'waoowaoo-gameplay-render', params.renderVersionId)
  const outputFile = path.join(tempDir, 'output.mp4')

  await fs.mkdir(tempDir, { recursive: true })

  try {
    await execFileAsync(
      'npx',
      [
        'remotion',
        'render',
        REMOTION_ENTRY,
        'GameplayVideoComposition',
        outputFile,
        '--props',
        JSON.stringify({ projectData }),
        '--frames',
        `0-${durationInFrames - 1}`,
        '--codec',
        'h264',
        '--overwrite',
      ],
      {
        cwd: process.cwd(),
        maxBuffer: 20 * 1024 * 1024,
      },
    )

    const buffer = await fs.readFile(outputFile)
    return await uploadVideoSourceToCos(buffer, 'gameplay-render', params.renderVersionId)
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
