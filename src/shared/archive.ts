import type { DecisionStep, SceneData } from './protocol'

export interface ArchivePublishInput {
  assumption: string
  universeTitle: string
  scenes: SceneData[]
  path: DecisionStep[]
  insight: string
}

export interface PublicArchive extends ArchivePublishInput {
  id: string
  archiveCode: string
  salvageCount: number
  createdAt: string
}

export interface ArchiveResponse {
  data: PublicArchive
}

export interface ArchiveErrorResponse {
  error: { code: string; message: string }
}
