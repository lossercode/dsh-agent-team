/** Durable group chat timeline, keyed by an auto-incrementing sequence. */
import { z } from 'zod'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import type { GroupMessage } from '../shared/groupchat.ts'

const messageSchema: z.ZodType<GroupMessage> = z.object({
  seq: z.number().int().min(0),
  id: z.string().min(1),
  role: z.enum(['user', 'agent']),
  memberId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  text: z.string(),
  state: z.enum(['running', 'done', 'error']).optional(),
  createdAt: z.string().min(1),
})

/** Persisted timeline table; version 1 is the initial schema. */
export const groupchatDomain = defineDomain({
  name: 'groupchat', version: 1,
  tables: { messages: domainTable<string, GroupMessage>(messageSchema) },
})

/**
 * Host-authoritative timeline store: append user/agent messages, update agent
 * message state, and let clients poll everything newer than a sequence.
 * Durable writes queue on a chain so `close()` can await them.
 */
export class GroupChatStore {
  private domain: Domain<typeof groupchatDomain> | undefined
  private seq = 0
  private writes: Promise<void> = Promise.resolve()
  /** Rows settled since the last poll; re-sent once so clients see the rewrite. */
  private readonly settled = new Set<number>()

  /**
   * Open the storage domain and resume the sequence from persisted rows.
   * @param storageDomain - cordis-provided storage domain service.
   */
  async open(storageDomain: { open(domain: typeof groupchatDomain): Promise<Domain<typeof groupchatDomain>> }): Promise<void> {
    this.domain = await storageDomain.open(groupchatDomain)
    for (const key of this.domain.table('messages').keys()) {
      const seq = Number.parseInt(key, 10)
      if (Number.isFinite(seq) && seq >= this.seq) this.seq = seq + 1
    }
  }

  /** Await queued writes, then release the storage domain. */
  async close(): Promise<void> {
    await this.writes
    await this.domain?.close()
    this.domain = undefined
  }

  /**
   * Append a message and return it with its assigned sequence.
   * @param message - message fields without seq (and state, which is derived).
   * @returns the stored message including seq.
   */
  append(message: Omit<GroupMessage, 'seq'>): GroupMessage {
    const domain = this.domain
    if (domain === undefined) throw new Error('groupchat: store is not open')
    const stored: GroupMessage = { ...message, seq: this.seq++ }
    this.enqueue(String(stored.seq), stored)
    return stored
  }

  /**
   * Overwrite one agent message, e.g. to move running -> done with final text.
   * @param message - complete message with its original seq.
   */
  update(message: GroupMessage): void {
    const domain = this.domain
    if (domain === undefined) throw new Error('groupchat: store is not open')
    this.enqueue(String(message.seq), message)
    if (message.state !== 'running') this.settled.add(message.seq)
  }

  /** Rows settled since the previous poll, in seq order; claiming clears the set. */
  takeSettled(): readonly GroupMessage[] {
    const domain = this.domain
    if (domain === undefined) throw new Error('groupchat: store is not open')
    const rows = [...this.settled]
      .sort((left, right) => left - right)
      .map(seq => domain.table('messages').get(String(seq)))
      .filter((message): message is GroupMessage => message !== undefined)
    this.settled.clear()
    return rows
  }

  /** Rows still in-flight; the poller re-fetches them until they settle. */
  listRunning(): readonly GroupMessage[] {
    const domain = this.domain
    if (domain === undefined) throw new Error('groupchat: store is not open')
    return [...domain.table('messages').entries()]
      .filter(([, message]) => message.state === 'running')
      .map(([, message]) => message)
  }

  /**
   * List messages with seq greater than `after`, oldest first.
   * @param after - exclusive lower bound of the sequence (use -1 for all).
   * @returns matching messages ordered by seq.
   */
  listAfter(after: number): readonly GroupMessage[] {
    const domain = this.domain
    if (domain === undefined) throw new Error('groupchat: store is not open')
    return [...domain.table('messages').entries()]
      .filter(([key]) => Number.parseInt(key, 10) > after)
      .sort(([left], [right]) => Number.parseInt(left, 10) - Number.parseInt(right, 10))
      .map(([, message]) => message)
  }

  /** Queue one durable write on the chain; failures stay on the chain for close(). */
  private enqueue(key: string, message: GroupMessage): void {
    const domain = this.domain!
    this.writes = this.writes
      .then(() => domain.table('messages').put(key, message))
      .catch((error: unknown) => { throw error })
  }
}
