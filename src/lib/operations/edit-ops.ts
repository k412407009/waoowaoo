import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { removeLocationPromptSuffix } from '@/lib/constants'
import { selectAssetRender } from '@/lib/assets/services/asset-actions'
import { updateAssetRenderLabel } from '@/lib/assets/services/asset-label'
import { deleteObject } from '@/lib/storage'
import { decodeImageUrlsFromDb, encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import type { ProjectAgentOperationRegistry } from './types'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function createEditOperations(): ProjectAgentOperationRegistry {
  return {
    select_asset_render: {
      id: 'select_asset_render',
      description: 'Select an asset render (character/location) as the canonical chosen image.',
      sideEffects: { mode: 'act', risk: 'low', overwrite: true },
      scope: 'asset',
      inputSchema: z.object({
        type: z.enum(['character', 'location']),
        assetId: z.string().min(1),
        appearanceId: z.string().optional(),
        imageIndex: z.number().int().nullable().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) =>
        selectAssetRender({
          kind: input.type,
          assetId: input.assetId,
          body: {
            ...(input.appearanceId ? { appearanceId: input.appearanceId } : {}),
            imageIndex: input.imageIndex ?? undefined,
          },
          access: {
            scope: 'project',
            userId: ctx.userId,
            projectId: ctx.projectId,
          },
        }),
    },
    update_asset_render_label: {
      id: 'update_asset_render_label',
      description: 'Update the display label watermark for a selected asset render (character/location).',
      sideEffects: { mode: 'act', risk: 'low', overwrite: true },
      scope: 'asset',
      inputSchema: z.object({
        type: z.enum(['character', 'location']),
        assetId: z.string().min(1),
        newName: z.string().min(1),
      }),
      outputSchema: z.object({ success: z.boolean() }),
      execute: async (ctx, input) => {
        await updateAssetRenderLabel({
          scope: 'project',
          kind: input.type,
          assetId: input.assetId,
          projectId: ctx.projectId,
          newName: input.newName,
        })
        return { success: true }
      },
    },
    update_character_appearance_description: {
      id: 'update_character_appearance_description',
      description: 'Update a project character appearance description (supports indexed description variants).',
      sideEffects: { mode: 'act', risk: 'low', overwrite: true },
      scope: 'asset',
      inputSchema: z.object({
        characterId: z.string().min(1),
        appearanceId: z.string().min(1),
        newDescription: z.string().min(1),
        descriptionIndex: z.number().int().min(0).optional().nullable(),
      }),
      outputSchema: z.object({ success: z.boolean() }),
      execute: async (ctx, input) => {
        const appearance = await prisma.characterAppearance.findFirst({
          where: {
            id: input.appearanceId,
            characterId: input.characterId,
            character: { projectId: ctx.projectId },
          },
          select: {
            id: true,
            description: true,
            descriptions: true,
          },
        })
        if (!appearance) throw new Error('NOT_FOUND')

        const trimmedDescription = input.newDescription.trim()

        let descriptions: string[] = []
        if (appearance.descriptions) {
          try {
            const parsed = JSON.parse(appearance.descriptions)
            descriptions = Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []
          } catch {
            descriptions = []
          }
        }
        if (descriptions.length === 0) {
          descriptions = [appearance.description || '']
        }

        const index = input.descriptionIndex === undefined || input.descriptionIndex === null ? 0 : input.descriptionIndex
        while (descriptions.length <= index) descriptions.push('')
        descriptions[index] = trimmedDescription
        if (!descriptions[0]) descriptions[0] = trimmedDescription

        await prisma.characterAppearance.update({
          where: { id: appearance.id },
          data: {
            descriptions: JSON.stringify(descriptions),
            description: descriptions[0] || trimmedDescription,
          },
        })

        return { success: true }
      },
    },
    update_location_image_description: {
      id: 'update_location_image_description',
      description: 'Update a project location image description (stored on locationImage record).',
      sideEffects: { mode: 'act', risk: 'low', overwrite: true },
      scope: 'asset',
      inputSchema: z.object({
        locationId: z.string().min(1),
        imageIndex: z.number().int().min(0).max(50).optional(),
        newDescription: z.string().min(1),
      }),
      outputSchema: z.object({ success: z.boolean() }),
      execute: async (ctx, input) => {
        const cleanDescription = removeLocationPromptSuffix(input.newDescription.trim())
        const imageIndex = input.imageIndex ?? 0

        const location = await prisma.projectLocation.findFirst({
          where: { id: input.locationId, projectId: ctx.projectId },
          select: { id: true },
        })
        if (!location) throw new Error('NOT_FOUND')

        const locationImage = await prisma.locationImage.findFirst({
          where: { locationId: input.locationId, imageIndex },
          select: { id: true },
        })
        if (!locationImage) throw new Error('NOT_FOUND')

        await prisma.locationImage.update({
          where: { id: locationImage.id },
          data: { description: cleanDescription },
        })
        return { success: true }
      },
    },
    update_shot_prompt: {
      id: 'update_shot_prompt',
      description: 'Update a shot prompt field (imagePrompt/videoPrompt).',
      sideEffects: { mode: 'act', risk: 'low', overwrite: true },
      scope: 'project',
      inputSchema: z.object({
        shotId: z.string().min(1),
        field: z.enum(['imagePrompt', 'videoPrompt']),
        value: z.string().optional().nullable(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const shot = await prisma.projectShot.findFirst({
          where: { id: input.shotId, clip: { episode: { projectId: ctx.projectId } } },
          select: { id: true },
        })
        if (!shot) throw new Error('NOT_FOUND')

        return await prisma.projectShot.update({
          where: { id: input.shotId },
          data: { [input.field]: input.value ?? null },
        })
      },
    },
    cleanup_unselected_images: {
      id: 'cleanup_unselected_images',
      description: 'Clean up unselected images for characters/locations by deleting unchosen objects and normalizing indices.',
      sideEffects: {
        mode: 'plan',
        risk: 'high',
        requiresConfirmation: true,
        destructive: true,
        bulk: true,
        longRunning: true,
        confirmationSummary: '将清理未选中的图片（会删除存储对象且不可逆）。确认继续后请重新调用并传入 confirmed=true。',
      },
      scope: 'project',
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        deletedCount: z.number().int().nonnegative(),
      }),
      execute: async (ctx) => {
        let deletedCount = 0

        const appearances = await prisma.characterAppearance.findMany({
          where: { character: { projectId: ctx.projectId } },
          include: { character: true },
        })

        for (const appearance of appearances) {
          if (appearance.selectedIndex === null) continue
          try {
            const imageUrls = decodeImageUrlsFromDb(appearance.imageUrls, 'characterAppearance.imageUrls')
            if (imageUrls.length <= 1) continue

            for (let i = 0; i < imageUrls.length; i++) {
              if (i !== appearance.selectedIndex && imageUrls[i]) {
                try {
                  const key = await resolveStorageKeyFromMediaValue(imageUrls[i]!)
                  if (key) {
                    await deleteObject(key)
                    deletedCount++
                  }
                } catch {}
              }
            }

            const selectedUrl = imageUrls[appearance.selectedIndex]
            if (!selectedUrl) continue
            await prisma.characterAppearance.update({
              where: { id: appearance.id },
              data: {
                imageUrls: encodeImageUrls([selectedUrl]),
                selectedIndex: 0,
              },
            })
          } catch {}
        }

        const locations = await prisma.projectLocation.findMany({
          where: { projectId: ctx.projectId },
          include: { images: true },
        })

        for (const location of locations) {
          const selectedImage = location.selectedImageId
            ? location.images.find((img) => img.id === location.selectedImageId)
            : location.images.find((img) => img.isSelected)
          if (!selectedImage) continue

          for (const img of location.images) {
            if (!img.isSelected && img.imageUrl) {
              try {
                const key = await resolveStorageKeyFromMediaValue(img.imageUrl)
                if (key) {
                  await deleteObject(key)
                  deletedCount++
                }
              } catch {}
              await prisma.locationImage.delete({ where: { id: img.id } })
            }
          }

          await prisma.locationImage.update({
            where: { id: selectedImage.id },
            data: { imageIndex: 0 },
          })
          await prisma.projectLocation.update({
            where: { id: location.id },
            data: { selectedImageId: selectedImage.id },
          })
        }

        return { success: true, deletedCount }
      },
    },
  }
}

