import { z } from 'zod'
import { listRecentMutationBatches } from '@/lib/mutation-batch/service'
import { revertMutationBatch } from '@/lib/mutation-batch/revert'
import type { ProjectAgentOperationRegistry } from './types'

export function createGovernanceOperations(): ProjectAgentOperationRegistry {
  return {
    list_recent_mutation_batches: {
      id: 'list_recent_mutation_batches',
      description: 'List recent mutation batches that can be reverted (undo).',
      sideEffects: { mode: 'query', risk: 'low' },
      scope: 'mutation-batch',
      inputSchema: z.object({
        limit: z.number().int().positive().max(20).optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const batches = await listRecentMutationBatches({
          projectId: ctx.projectId,
          userId: ctx.userId,
          limit: input.limit || 10,
        })
        return batches.map((batch) => ({
          id: batch.id,
          status: batch.status,
          source: batch.source,
          operationId: batch.operationId,
          summary: batch.summary,
          createdAt: batch.createdAt.toISOString(),
          revertedAt: batch.revertedAt ? batch.revertedAt.toISOString() : null,
          entryCount: batch.entries.length,
          entries: batch.entries.map((entry) => ({
            id: entry.id,
            kind: entry.kind,
            targetType: entry.targetType,
            targetId: entry.targetId,
            createdAt: entry.createdAt.toISOString(),
          })),
        }))
      },
    },
    revert_mutation_batch: {
      id: 'revert_mutation_batch',
      description: 'Revert (undo) a mutation batch by id.',
      sideEffects: {
        mode: 'plan',
        risk: 'high',
        requiresConfirmation: true,
        destructive: true,
        confirmationSummary: '将撤回一次批量变更（可能删除或覆盖已有内容）。确认继续后请重新调用并传入 confirmed=true。',
      },
      scope: 'mutation-batch',
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        batchId: z.string().min(1),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => revertMutationBatch({
        batchId: input.batchId,
        projectId: ctx.projectId,
        userId: ctx.userId,
      }),
    },
  }
}
