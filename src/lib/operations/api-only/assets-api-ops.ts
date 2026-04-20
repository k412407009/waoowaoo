import { z } from 'zod'
import { ApiError } from '@/lib/api-errors'
import { createAsset, copyAssetFromGlobal, removeAsset, revertAssetRender, selectAssetRender, submitAssetGenerateTask, submitAssetModifyTask, updateAsset, updateAssetVariant } from '@/lib/assets/services/asset-actions'
import { updateAssetRenderLabel } from '@/lib/assets/services/asset-label'
import { readAssets } from '@/lib/assets/services/read-assets'
import type { AssetKind, AssetScope } from '@/lib/assets/contracts'
import type { ProjectAgentOperationRegistry } from '@/lib/operations/types'

const ASSET_SCOPES = ['global', 'project'] as const
const ASSET_KINDS = ['character', 'location', 'prop', 'voice'] as const
const ASSET_MUTABLE_KINDS = ['character', 'location', 'prop'] as const
const ASSET_CREATABLE_KINDS = ['location', 'prop'] as const

const scopeSchema = z.enum(ASSET_SCOPES satisfies ReadonlyArray<AssetScope>)
const kindSchema = z.enum(ASSET_KINDS satisfies ReadonlyArray<AssetKind>)
const mutableKindSchema = z.enum(ASSET_MUTABLE_KINDS satisfies ReadonlyArray<Extract<AssetKind, 'character' | 'location' | 'prop'>>)
const creatableKindSchema = z.enum(ASSET_CREATABLE_KINDS satisfies ReadonlyArray<Extract<AssetKind, 'location' | 'prop'>>)

function requireProjectId(scope: AssetScope, projectId: unknown): string {
  if (scope !== 'project') return ''
  if (typeof projectId === 'string' && projectId.trim()) return projectId.trim()
  throw new ApiError('INVALID_PARAMS', { details: 'projectId is required for project scope' })
}

function omitBodyKeys(input: unknown, keys: ReadonlyArray<string>): Record<string, unknown> {
  const record = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
  const body: Record<string, unknown> = { ...record }
  for (const key of keys) {
    delete body[key]
  }
  return body
}

export function createAssetsApiOperations(): ProjectAgentOperationRegistry {
  return {
    api_assets_read: {
      id: 'api_assets_read',
      description: 'API-only: Read assets with scope filter.',
      sideEffects: { mode: 'query', risk: 'low' },
      scope: 'asset',
      inputSchema: z.object({
        scope: scopeSchema,
        projectId: z.string().nullable().optional(),
        folderId: z.string().nullable().optional(),
        kind: kindSchema.nullable().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const scope = input.scope
        const projectId = typeof input.projectId === 'string' && input.projectId.trim() ? input.projectId.trim() : null
        const folderId = typeof input.folderId === 'string' && input.folderId.trim() ? input.folderId.trim() : null
        const kind = input.kind ?? null

        const assets = scope === 'global'
          ? await readAssets({ scope, projectId, folderId, kind }, { userId: ctx.userId })
          : await readAssets({ scope, projectId: requireProjectId(scope, projectId), folderId, kind })

        return { assets }
      },
    },

    api_assets_create: {
      id: 'api_assets_create',
      description: 'API-only: Create a location/prop asset (global or project scope).',
      sideEffects: { mode: 'act', risk: 'low' },
      scope: 'asset',
      inputSchema: z.object({
        scope: scopeSchema,
        kind: creatableKindSchema,
        projectId: z.string().optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const scope = input.scope
        const projectId = requireProjectId(scope, input.projectId)
        return await createAsset({
          kind: input.kind,
          body: input as unknown as Record<string, unknown>,
          access: scope === 'project'
            ? { scope: 'project', userId: ctx.userId, projectId }
            : { scope: 'global', userId: ctx.userId },
        })
      },
    },

    api_assets_update: {
      id: 'api_assets_update',
      description: 'API-only: Update an asset record (global or project scope).',
      sideEffects: { mode: 'act', risk: 'low' },
      scope: 'asset',
      inputSchema: z.object({
        assetId: z.string().min(1),
        scope: scopeSchema,
        kind: kindSchema,
        projectId: z.string().optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const projectId = requireProjectId(input.scope, input.projectId)
        const body = omitBodyKeys(input, ['assetId'])
        return await updateAsset({
          kind: input.kind,
          assetId: input.assetId,
          body,
          access: input.scope === 'project'
            ? { scope: 'project', userId: ctx.userId, projectId }
            : { scope: 'global', userId: ctx.userId },
        })
      },
    },

    api_assets_remove: {
      id: 'api_assets_remove',
      description: 'API-only: Remove a location/prop asset (global or project scope).',
      sideEffects: { mode: 'act', risk: 'low' },
      scope: 'asset',
      inputSchema: z.object({
        assetId: z.string().min(1),
        scope: scopeSchema,
        kind: z.enum(['location', 'prop']),
        projectId: z.string().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const projectId = requireProjectId(input.scope, input.projectId)
        return await removeAsset({
          kind: input.kind,
          assetId: input.assetId,
          access: input.scope === 'project'
            ? { scope: 'project', userId: ctx.userId, projectId }
            : { scope: 'global', userId: ctx.userId },
        })
      },
    },

    api_assets_generate: {
      id: 'api_assets_generate',
      description: 'API-only: Submit asset generate task (global or project scope).',
      sideEffects: { mode: 'act', risk: 'low', longRunning: true },
      scope: 'asset',
      inputSchema: z.object({
        assetId: z.string().min(1),
        scope: scopeSchema,
        kind: mutableKindSchema,
        projectId: z.string().optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const projectId = requireProjectId(input.scope, input.projectId)
        const body = omitBodyKeys(input, ['assetId'])
        return await submitAssetGenerateTask({
          request: ctx.request,
          kind: input.kind,
          assetId: input.assetId,
          body,
          access: input.scope === 'project'
            ? { scope: 'project', userId: ctx.userId, projectId }
            : { scope: 'global', userId: ctx.userId },
        })
      },
    },

    api_assets_modify_render: {
      id: 'api_assets_modify_render',
      description: 'API-only: Submit asset modify-render task (global or project scope).',
      sideEffects: { mode: 'act', risk: 'low', longRunning: true },
      scope: 'asset',
      inputSchema: z.object({
        assetId: z.string().min(1),
        scope: scopeSchema,
        kind: mutableKindSchema,
        projectId: z.string().optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const projectId = requireProjectId(input.scope, input.projectId)
        const body = omitBodyKeys(input, ['assetId'])
        return await submitAssetModifyTask({
          request: ctx.request,
          kind: input.kind,
          assetId: input.assetId,
          body,
          access: input.scope === 'project'
            ? { scope: 'project', userId: ctx.userId, projectId }
            : { scope: 'global', userId: ctx.userId },
        })
      },
    },

    api_assets_select_render: {
      id: 'api_assets_select_render',
      description: 'API-only: Select an asset render (global or project scope).',
      sideEffects: { mode: 'act', risk: 'low', overwrite: true },
      scope: 'asset',
      inputSchema: z.object({
        assetId: z.string().min(1),
        scope: scopeSchema,
        kind: mutableKindSchema,
        projectId: z.string().optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const projectId = requireProjectId(input.scope, input.projectId)
        const body = omitBodyKeys(input, ['assetId'])
        return await selectAssetRender({
          kind: input.kind,
          assetId: input.assetId,
          body,
          access: input.scope === 'project'
            ? { scope: 'project', userId: ctx.userId, projectId }
            : { scope: 'global', userId: ctx.userId },
        })
      },
    },

    api_assets_revert_render: {
      id: 'api_assets_revert_render',
      description: 'API-only: Revert an asset render (global or project scope).',
      sideEffects: { mode: 'act', risk: 'low', overwrite: true },
      scope: 'asset',
      inputSchema: z.object({
        assetId: z.string().min(1),
        scope: scopeSchema,
        kind: mutableKindSchema,
        projectId: z.string().optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const projectId = requireProjectId(input.scope, input.projectId)
        const body = omitBodyKeys(input, ['assetId'])
        return await revertAssetRender({
          kind: input.kind,
          assetId: input.assetId,
          body,
          access: input.scope === 'project'
            ? { scope: 'project', userId: ctx.userId, projectId }
            : { scope: 'global', userId: ctx.userId },
        })
      },
    },

    api_assets_copy_from_global: {
      id: 'api_assets_copy_from_global',
      description: 'API-only: Copy a global asset into a project target asset.',
      sideEffects: { mode: 'act', risk: 'low', overwrite: true },
      scope: 'asset',
      inputSchema: z.object({
        assetId: z.string().min(1),
        projectId: z.string().min(1),
        globalAssetId: z.string().min(1),
        kind: kindSchema,
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        return await copyAssetFromGlobal({
          kind: input.kind,
          targetId: input.assetId,
          globalAssetId: input.globalAssetId,
          access: {
            userId: ctx.userId,
            projectId: input.projectId,
          },
        })
      },
    },

    api_assets_update_label: {
      id: 'api_assets_update_label',
      description: 'API-only: Update asset render label (global or project scope).',
      sideEffects: { mode: 'act', risk: 'low' },
      scope: 'asset',
      inputSchema: z.object({
        assetId: z.string().min(1),
        scope: scopeSchema,
        kind: mutableKindSchema,
        projectId: z.string().optional(),
        newName: z.string().min(1),
      }),
      outputSchema: z.unknown(),
      execute: async (_ctx, input) => {
        if (input.scope === 'project') {
          requireProjectId(input.scope, input.projectId)
        }
        await updateAssetRenderLabel({
          scope: input.scope,
          kind: input.kind,
          assetId: input.assetId,
          projectId: input.projectId,
          newName: input.newName,
        })
        return { success: true }
      },
    },

    api_assets_update_variant: {
      id: 'api_assets_update_variant',
      description: 'API-only: Update an asset variant record (global or project scope).',
      sideEffects: { mode: 'act', risk: 'low' },
      scope: 'asset',
      inputSchema: z.object({
        assetId: z.string().min(1),
        variantId: z.string().min(1),
        scope: scopeSchema,
        kind: mutableKindSchema,
        projectId: z.string().optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const projectId = requireProjectId(input.scope, input.projectId)
        const body = omitBodyKeys(input, ['assetId', 'variantId'])
        return await updateAssetVariant({
          kind: input.kind,
          assetId: input.assetId,
          variantId: input.variantId,
          body,
          access: input.scope === 'project'
            ? { scope: 'project', userId: ctx.userId, projectId }
            : { scope: 'global', userId: ctx.userId },
        })
      },
    },
  }
}
