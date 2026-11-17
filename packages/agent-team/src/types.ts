/** Wire types crossing the Host-client Remote boundary, published via `./types`. */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

/** One group member: a model route plus presentation bits. */
export interface GroupMember {
  readonly id: string
  /** Display name used for @mention matching and bubbles. */
  readonly name: string
  /** Accent color of the member's bubble. */
  readonly color: string
  /** LLM route; validated against the host catalog at group creation time. */
  readonly provider: string
  readonly model: string
}

/** A persisted group: members plus the designated owner. */
export interface GroupRecord {
  readonly id: string
  readonly name: string
  /** Member id of the group owner; defaults to the first member. */
  readonly ownerMemberId: string
  readonly members: readonly GroupMember[]
  readonly createdAt: string
}

/** One model entry of the host catalog, scoped by provider route. */
export interface CatalogModel {
  readonly provider: string
  readonly id: string
  readonly name: string
}

/** One provider group of the host catalog. */
export interface CatalogProvider {
  readonly provider: string
  readonly providerName: string
  readonly models: readonly CatalogModel[]
}

export interface CatalogValue {
  readonly providers: readonly CatalogProvider[]
}

/** Member payload accepted at group creation; colors and ids are host-assigned. */
export interface CreateGroupMember {
  readonly name: string
  readonly provider: string
  readonly model: string
}

export interface CreateGroupRequest {
  readonly name: string
  /** Member id of the owner; defaults to the first member. */
  readonly ownerMemberId?: string | undefined
  readonly members: readonly CreateGroupMember[]
}

export interface CreateGroupValue {
  readonly group: GroupRecord
}

export interface GroupsValue {
  readonly groups: readonly GroupRecord[]
}

export interface DeleteGroupRequest {
  readonly id: string
}

export interface DeleteGroupValue {
  readonly deleted: boolean
}

/** Lifecycle of an agent-side message: created running, finished by projection. */
export type GroupMessageState = 'running' | 'done' | 'error'

/** One timeline message, host-authoritative and seq-ordered. */
export interface GroupMessage {
  readonly seq: number
  readonly id: string
  /** Owning group; absent on legacy rows written before groups existed. */
  readonly groupId?: string | undefined
  readonly role: 'user' | 'agent'
  readonly memberId?: string | undefined
  readonly sessionId?: string | undefined
  readonly text: string
  readonly state?: GroupMessageState | undefined
  readonly createdAt: string
}

export interface SendRequest {
  readonly groupId: string
  readonly text: string
}

export interface SendValue {
  readonly accepted: boolean
}

export interface MessagesRequest {
  readonly groupId: string
  readonly after: number
}

export interface MessagesValue {
  readonly messages: readonly GroupMessage[]
}

/** Client-side Remote handle onto the host group chat service. */
export interface GroupChatRemote {
  send(request: SendRequest): Promise<RemoteResult<SendValue>>
  messages(request: MessagesRequest): Promise<RemoteResult<MessagesValue>>
  groups(): Promise<RemoteResult<GroupsValue>>
  createGroup(request: CreateGroupRequest): Promise<RemoteResult<CreateGroupValue>>
  deleteGroup(request: DeleteGroupRequest): Promise<RemoteResult<DeleteGroupValue>>
  catalog(): Promise<RemoteResult<CatalogValue>>
}
