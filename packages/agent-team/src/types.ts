/** Wire types crossing the Host-client Remote boundary, published via `./types`. */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

/** One chat member: presentation color plus optional LLM routing. */
export interface GroupMember {
  readonly id: string
  readonly name: string
  /** Accent color of the member's bubble. */
  readonly color: string
  /** LLM routing; members without a provider use the Session default model. */
  readonly provider?: string | undefined
  readonly model?: string | undefined
}

/** Lifecycle of an agent-side message: created running, finished by projection. */
export type GroupMessageState = 'running' | 'done' | 'error'

/** One timeline message, host-authoritative and seq-ordered. */
export interface GroupMessage {
  readonly seq: number
  readonly id: string
  readonly role: 'user' | 'agent'
  readonly memberId?: string | undefined
  readonly sessionId?: string | undefined
  readonly text: string
  readonly state?: GroupMessageState | undefined
  readonly createdAt: string
}

export interface SendRequest {
  readonly text: string
}

export interface SendValue {
  readonly accepted: boolean
}

export interface MessagesRequest {
  readonly after: number
}

export interface MessagesValue {
  readonly messages: readonly GroupMessage[]
}

/** Client-side Remote handle onto the host group chat service. */
export interface GroupChatRemote {
  send(request: SendRequest): Promise<RemoteResult<SendValue>>
  messages(request: MessagesRequest): Promise<RemoteResult<MessagesValue>>
}
