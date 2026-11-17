/** Durable group chat state: groups plus the per-group timeline, seq-ordered. */
import { z } from 'zod'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import type { GroupMember, GroupMessage, GroupRecord } from '../shared/groupchat.ts'

const memberSchema: z.ZodType<GroupMember> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
})

const groupSchema: z.ZodType<GroupRecord> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  ownerMemberId: z.string().min(1),
  members: z.array(memberSchema).min(1),
  createdAt: z.string().min(1),
})

const messageSchema: z.ZodType<GroupMessage> = z.object({
  seq: z.number().int().min(0),
  id: z.string().min(1),
  // Optional so version-1 rows written before groups still decode.
  groupId: z.string().min(1).optional(),
  role: z.enum(['user', 'agent']),
  memberId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  text: z.string(),
  state: z.enum(['running', 'done', 'error']).optional(),
  createdAt: z.string().min(1),
})

/** Persisted tables; version 2 adds groups alongside the timeline. */
export const groupchatDomain = defineDomain({
  name: 'groupchat', version: 2, compatibleVersions: [1],
  tables: {
    messages: domainTable<string, GroupMessage>(messageSchema),
    groups: domainTable<string, GroupRecord>(groupSchema),
  },
})

/**
 * Host-authoritative state store: groups plus the append/update timeline.
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

  // ── Groups ─────────────────────────────────────────────────────

  /** All persisted groups, oldest first. */
  listGroups(): readonly GroupRecord[] {
    const domain = this.domain
    if (domain === undefined) throw new Error('groupchat: store is not open')
    return [...domain.table('groups').entries()]
      .map(([, group]) => group)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
  }

  /**
   * Fetch one group by id.
   * @param id - group id.
   * @returns the record, or undefined when absent.
   */
  getGroup(id: string): GroupRecord | undefined {
    const domain = this.domain
    if (domain === undefined) throw new Error('groupchat: store is not open')
    return domain.table('groups').get(id)
  }

  /**
   * Insert or replace one group.
   * @param group - complete group record.
   */
  putGroup(group: GroupRecord): void {
    const domain = this.domain
    if (domain === undefined) throw new Error('groupchat: store is not open')
    this.enqueueGroup(group.id, group)
  }

  /**
   * Remove one group and its whole timeline.
   * @param id - group id.
   */
  deleteGroup(id: string): void {
    const domain = this.domain
    if (domain === undefined) throw new Error('groupchat: store is not open')
    this.writes = this.writes.then(async () => {
      await domain.table('groups').delete(id)
      for (const [key, message] of domain.table('messages').entries()) {
        if (message.groupId === id) await domain.table('messages').delete(key)
      }
    }).catch((error: unknown) => { throw error })
  }

  // ── Messages ───────────────────────────────────────────────────

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

  /**
   * Settled rows of one group since the previous poll, in seq order; claiming
   * only clears entries of that group so other groups keep their rewrites.
   * @param groupId - owning group id.
   * @returns the group's rewritten rows.
   */
  takeSettled(groupId: string): readonly GroupMessage[] {
    const domain = this.domain
    if (domain === undefined) throw new Error('groupchat: store is not open')
    const rows = [...this.settled]
      .sort((left, right) => left - right)
      .map(seq => domain.table('messages').get(String(seq)))
      .filter((message): message is GroupMessage => message !== undefined && message.groupId === groupId)
    for (const message of rows) this.settled.delete(message.seq)
    return rows
  }

  /**
   * Rows of one group still in-flight; the poller re-fetches them until they settle.
   * @param groupId - owning group id.
   * @returns the group's running rows.
   */
  listRunning(groupId: string): readonly GroupMessage[] {
    const domain = this.domain
    if (domain === undefined) throw new Error('groupchat: store is not open')
    return [...domain.table('messages').entries()]
      .filter(([, message]) => message.state === 'running' && message.groupId === groupId)
      .map(([, message]) => message)
  }

  /**
   * List messages of one group with seq greater than `after`, oldest first.
   * @param groupId - owning group id.
   * @param after - exclusive lower bound of the sequence (use -1 for all).
   * @returns matching messages ordered by seq.
   */
  listAfter(groupId: string, after: number): readonly GroupMessage[] {
    const domain = this.domain
    if (domain === undefined) throw new Error('groupchat: store is not open')
    return [...domain.table('messages').entries()]
      .filter(([key, message]) => message.groupId === groupId && Number.parseInt(key, 10) > after)
      .sort(([left], [right]) => Number.parseInt(left, 10) - Number.parseInt(right, 10))
      .map(([, message]) => message)
  }

  /**
   * Fetch one message by sequence.
   * @param seq - message sequence.
   * @returns the message, or undefined when absent.
   */
  getMessage(seq: number): GroupMessage | undefined {
    const domain = this.domain
    if (domain === undefined) throw new Error('groupchat: store is not open')
    return domain.table('messages').get(String(seq))
  }

  /** Queue one durable message write on the chain. */
  private enqueue(key: string, message: GroupMessage): void {
    const domain = this.domain!
    this.writes = this.writes
      .then(() => domain.table('messages').put(key, message))
      .catch((error: unknown) => { throw error })
  }

  /** Queue one durable group write on the chain. */
  private enqueueGroup(key: string, group: GroupRecord): void {
    const domain = this.domain!
    this.writes = this.writes
      .then(() => domain.table('groups').put(key, group))
      .catch((error: unknown) => { throw error })
  }
}
