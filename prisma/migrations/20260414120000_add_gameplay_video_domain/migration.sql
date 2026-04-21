CREATE TABLE `gameplay_video_projects` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `language` VARCHAR(191) NOT NULL DEFAULT 'zh',
  `aspectRatio` VARCHAR(191) NOT NULL DEFAULT '9:16',
  `targetDurationSec` INTEGER NOT NULL DEFAULT 20,
  `visualStyle` TEXT NULL,
  `uiStyle` TEXT NULL,
  `narratorVoice` TEXT NULL,
  `endSlateConfig` TEXT NULL,
  `analysisModel` VARCHAR(191) NULL,
  `imageModel` VARCHAR(191) NULL,
  `videoModel` VARCHAR(191) NULL,
  `audioModel` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `gameplay_video_projects_projectId_key`(`projectId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `gameplay_video_projects_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE `gameplay_briefs` (
  `id` VARCHAR(191) NOT NULL,
  `gameplayVideoProjectId` VARCHAR(191) NOT NULL,
  `script` TEXT NOT NULL,
  `sellingPoints` TEXT NULL,
  `coreLoop` TEXT NULL,
  `targetAudience` TEXT NULL,
  `platforms` TEXT NULL,
  `cta` TEXT NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `gameplay_briefs_gameplayVideoProjectId_key`(`gameplayVideoProjectId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `gameplay_briefs_gameplayVideoProjectId_fkey`
    FOREIGN KEY (`gameplayVideoProjectId`) REFERENCES `gameplay_video_projects`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE `gameplay_references` (
  `id` VARCHAR(191) NOT NULL,
  `gameplayVideoProjectId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL DEFAULT 'style',
  `title` VARCHAR(191) NULL,
  `imageUrl` TEXT NULL,
  `notes` TEXT NULL,
  `imageMediaId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `gameplay_references_gameplayVideoProjectId_idx`(`gameplayVideoProjectId`),
  INDEX `gameplay_references_imageMediaId_idx`(`imageMediaId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `gameplay_references_gameplayVideoProjectId_fkey`
    FOREIGN KEY (`gameplayVideoProjectId`) REFERENCES `gameplay_video_projects`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `gameplay_references_imageMediaId_fkey`
    FOREIGN KEY (`imageMediaId`) REFERENCES `media_objects`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE `gameplay_beats` (
  `id` VARCHAR(191) NOT NULL,
  `gameplayVideoProjectId` VARCHAR(191) NOT NULL,
  `orderIndex` INTEGER NOT NULL,
  `archetype` VARCHAR(64) NULL,
  `intent` TEXT NOT NULL,
  `durationSec` INTEGER NOT NULL DEFAULT 3,
  `camera` TEXT NULL,
  `uiNeeds` TEXT NULL,
  `subtitleText` TEXT NULL,
  `voiceoverText` TEXT NULL,
  `voiceoverAudioUrl` TEXT NULL,
  `voiceoverAudioMediaId` VARCHAR(191) NULL,
  `voiceoverDurationMs` INTEGER NULL,
  `generationMode` VARCHAR(191) NOT NULL DEFAULT 'hybrid',
  `shotPrompt` TEXT NULL,
  `overlaySpec` TEXT NULL,
  `selectedShotId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `gameplay_beats_gameplayVideoProjectId_orderIndex_key`(`gameplayVideoProjectId`, `orderIndex`),
  INDEX `gameplay_beats_gameplayVideoProjectId_idx`(`gameplayVideoProjectId`),
  INDEX `gameplay_beats_selectedShotId_idx`(`selectedShotId`),
  INDEX `gameplay_beats_voiceoverAudioMediaId_idx`(`voiceoverAudioMediaId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `gameplay_beats_gameplayVideoProjectId_fkey`
    FOREIGN KEY (`gameplayVideoProjectId`) REFERENCES `gameplay_video_projects`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `gameplay_beats_voiceoverAudioMediaId_fkey`
    FOREIGN KEY (`voiceoverAudioMediaId`) REFERENCES `media_objects`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE `gameplay_keyframes` (
  `id` VARCHAR(191) NOT NULL,
  `beatId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `prompt` TEXT NULL,
  `imageUrl` TEXT NULL,
  `imageMediaId` VARCHAR(191) NULL,
  `referenceIds` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `gameplay_keyframes_beatId_kind_key`(`beatId`, `kind`),
  INDEX `gameplay_keyframes_beatId_idx`(`beatId`),
  INDEX `gameplay_keyframes_imageMediaId_idx`(`imageMediaId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `gameplay_keyframes_beatId_fkey`
    FOREIGN KEY (`beatId`) REFERENCES `gameplay_beats`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `gameplay_keyframes_imageMediaId_fkey`
    FOREIGN KEY (`imageMediaId`) REFERENCES `media_objects`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE `gameplay_shots` (
  `id` VARCHAR(191) NOT NULL,
  `beatId` VARCHAR(191) NOT NULL,
  `variantIndex` INTEGER NOT NULL DEFAULT 0,
  `mode` VARCHAR(191) NOT NULL DEFAULT 'hybrid',
  `prompt` TEXT NULL,
  `videoUrl` TEXT NULL,
  `videoMediaId` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `notes` TEXT NULL,
  `overlaySpec` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `gameplay_shots_beatId_variantIndex_key`(`beatId`, `variantIndex`),
  INDEX `gameplay_shots_beatId_idx`(`beatId`),
  INDEX `gameplay_shots_videoMediaId_idx`(`videoMediaId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `gameplay_shots_beatId_fkey`
    FOREIGN KEY (`beatId`) REFERENCES `gameplay_beats`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `gameplay_shots_videoMediaId_fkey`
    FOREIGN KEY (`videoMediaId`) REFERENCES `media_objects`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE `gameplay_beats`
  ADD CONSTRAINT `gameplay_beats_selectedShotId_fkey`
  FOREIGN KEY (`selectedShotId`) REFERENCES `gameplay_shots`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `gameplay_edit_projects` (
  `id` VARCHAR(191) NOT NULL,
  `gameplayVideoProjectId` VARCHAR(191) NOT NULL,
  `projectData` TEXT NOT NULL,
  `renderStatus` VARCHAR(191) NULL,
  `renderTaskId` VARCHAR(191) NULL,
  `outputUrl` TEXT NULL,
  `outputMediaId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `gameplay_edit_projects_gameplayVideoProjectId_key`(`gameplayVideoProjectId`),
  INDEX `gameplay_edit_projects_outputMediaId_idx`(`outputMediaId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `gameplay_edit_projects_gameplayVideoProjectId_fkey`
    FOREIGN KEY (`gameplayVideoProjectId`) REFERENCES `gameplay_video_projects`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `gameplay_edit_projects_outputMediaId_fkey`
    FOREIGN KEY (`outputMediaId`) REFERENCES `media_objects`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE `gameplay_render_versions` (
  `id` VARCHAR(191) NOT NULL,
  `gameplayVideoProjectId` VARCHAR(191) NOT NULL,
  `editorProjectId` VARCHAR(191) NULL,
  `language` VARCHAR(191) NOT NULL DEFAULT 'zh',
  `aspectRatio` VARCHAR(191) NOT NULL DEFAULT '9:16',
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `outputUrl` TEXT NULL,
  `outputMediaId` VARCHAR(191) NULL,
  `taskId` VARCHAR(191) NULL,
  `errorMessage` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `gameplay_render_versions_gameplayVideoProjectId_idx`(`gameplayVideoProjectId`),
  INDEX `gameplay_render_versions_editorProjectId_idx`(`editorProjectId`),
  INDEX `gameplay_render_versions_outputMediaId_idx`(`outputMediaId`),
  INDEX `gameplay_render_versions_taskId_idx`(`taskId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `gameplay_render_versions_gameplayVideoProjectId_fkey`
    FOREIGN KEY (`gameplayVideoProjectId`) REFERENCES `gameplay_video_projects`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `gameplay_render_versions_editorProjectId_fkey`
    FOREIGN KEY (`editorProjectId`) REFERENCES `gameplay_edit_projects`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `gameplay_render_versions_outputMediaId_fkey`
    FOREIGN KEY (`outputMediaId`) REFERENCES `media_objects`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
);
