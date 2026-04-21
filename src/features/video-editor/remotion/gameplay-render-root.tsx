import React from 'react'
import { Composition, registerRoot } from 'remotion'
import VideoComposition from './VideoComposition'
import type { VideoEditorProject } from '../types/editor.types'

const DEFAULT_PROJECT: VideoEditorProject = {
  id: 'gameplay-render-default',
  episodeId: 'gameplay-render-default',
  schemaVersion: '1.0',
  config: {
    fps: 30,
    width: 1080,
    height: 1920,
  },
  timeline: [],
  bgmTrack: [],
}

const GameplayVideoComposition: React.FC<{ projectData: VideoEditorProject }> = ({ projectData }) => {
  return (
    <VideoComposition
      clips={projectData.timeline}
      bgmTrack={projectData.bgmTrack}
      config={projectData.config}
    />
  )
}

const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="GameplayVideoComposition"
      component={GameplayVideoComposition}
      durationInFrames={1200}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ projectData: DEFAULT_PROJECT }}
    />
  )
}

registerRoot(RemotionRoot)
