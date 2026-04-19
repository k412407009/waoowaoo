import { beforeEach, describe, expect, it } from 'vitest'
import { resetSystemState } from '../helpers/db-reset'
import { prisma } from '../helpers/prisma'
import { seedMinimalDomainState } from '../system/helpers/seed'

describe('regression - undo delete_panel restores customized panelNumber', () => {
  beforeEach(async () => {
    await resetSystemState()
  })

  it('panel_delete_restore uses saved panel.panelNumber (not panelIndex+1)', async () => {
    const seeded = await seedMinimalDomainState()

    const storyboardId = seeded.storyboard.id

    const thirdPanel = await prisma.projectPanel.create({
      data: {
        storyboardId,
        panelIndex: 2,
        panelNumber: 3,
        description: 'third panel',
      },
      select: { id: true, panelIndex: true, panelNumber: true },
    })

    await prisma.projectPanel.update({
      where: { id: seeded.secondaryPanel.id },
      data: { panelNumber: 99 },
    })

    const deletedPanel = await prisma.projectPanel.findUniqueOrThrow({
      where: { id: seeded.secondaryPanel.id },
      select: {
        id: true,
        storyboardId: true,
        panelIndex: true,
        panelNumber: true,
        description: true,
      },
    })

    // Apply the same safe shifting logic as delete_panel (avoid unique conflicts).
    await prisma.$transaction(async (tx) => {
      await tx.projectPanel.delete({ where: { id: deletedPanel.id } })

      const maxPanel = await tx.projectPanel.findFirst({
        where: { storyboardId },
        orderBy: { panelIndex: 'desc' },
        select: { panelIndex: true },
      })
      const maxPanelIndex = maxPanel?.panelIndex ?? -1
      const offset = maxPanelIndex + 1000

      await tx.projectPanel.updateMany({
        where: {
          storyboardId,
          panelIndex: { gt: deletedPanel.panelIndex },
        },
        data: {
          panelIndex: { increment: offset },
          panelNumber: { increment: offset },
        },
      })

      await tx.projectPanel.updateMany({
        where: {
          storyboardId,
          panelIndex: { gt: deletedPanel.panelIndex + offset },
        },
        data: {
          panelIndex: { decrement: offset + 1 },
          panelNumber: { decrement: offset + 1 },
        },
      })

      const panelCount = await tx.projectPanel.count({ where: { storyboardId } })
      await tx.projectStoryboard.update({
        where: { id: storyboardId },
        data: { panelCount },
      })
    })

    const { revertMutationEntry } = await import('@/lib/mutation-batch/revert')
    await revertMutationEntry({
      kind: 'panel_delete_restore',
      targetType: 'ProjectStoryboard',
      targetId: storyboardId,
      payload: { panel: deletedPanel },
      projectId: seeded.project.id,
      userId: seeded.user.id,
    })

    const restored = await prisma.projectPanel.findUniqueOrThrow({
      where: { id: deletedPanel.id },
      select: { panelIndex: true, panelNumber: true },
    })
    expect(restored.panelIndex).toBe(1)
    expect(restored.panelNumber).toBe(99)

    const shiftedBack = await prisma.projectPanel.findUniqueOrThrow({
      where: { id: thirdPanel.id },
      select: { panelIndex: true, panelNumber: true },
    })
    expect(shiftedBack.panelIndex).toBe(2)
    expect(shiftedBack.panelNumber).toBe(3)
  })
})

