/** Host-side entry: a Typert Remote Service owning groups and the timelines. */
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  CatalogValue, CreateGroupRequest, CreateGroupValue, DeleteGroupRequest, DeleteGroupValue,
  GroupsValue, MessagesRequest, MessagesValue, SendRequest, SendValue,
} from './types.ts'
import type { GroupMember, GroupRecord } from './shared/groupchat.ts'
import { assignColor, stripMentions } from './shared/groupchat.ts'
import { GroupChatStore } from './server/store.ts'
import { GroupChatWorkers } from './server/pool.ts'

export type * from './types.ts'

/**
 * Group chat backend as a class plugin: one Remote Service exposing groups
 * management, the model catalog, `send` and `messages` over the official
 * client-host RPC channel. Each @mention dispatches through the built-in
 * Session engine; no HTTP surface is owned.
 */
export default class GroupChatService extends TypertRemoteService {
  static inject = ['llm', 'storageDomain']

  private readonly store = new GroupChatStore()
  private readonly workers: GroupChatWorkers

  /**
   * @param ctx - host context carrying the LLM resolver and storage domain.
   */
  constructor(ctx: Context) {
    super(ctx, 'groupChat')
    this.workers = new GroupChatWorkers(ctx, this.store)
    ctx.effect(() => {
      void this.store.open(ctx.storageDomain).catch((error: unknown) => {
        ctx.logger.warn(`dsh-agent-team: storage domain open failed: ${String(error)}`)
      })
      this.workers.start()
      return () => {
        this.workers.stop()
        void this.store.close()
      }
    })
  }

  /**
   * List all groups, oldest first.
   * @returns the group records.
   */
  @Remote('groups')
  groups(): Promise<GroupsValue> {
    return Promise.resolve({ groups: this.store.listGroups() })
  }

  /**
   * Create one group: validate the name and every member route, assign ids and
   * colors, and default the owner to the first member.
   * @param request - group name, optional owner member id and member routes.
   * @returns the stored group record.
   */
  @Remote('createGroup')
  async createGroup(request: CreateGroupRequest): Promise<CreateGroupValue> {
    const name = request.name.trim()
    if (name === '') throw new Error('群组名称不能为空')
    if (request.members.length === 0) throw new Error('至少需要一名成员')
    const taken = this.store.listGroups().some(group => group.name === name)
    if (taken) throw new Error(`群组名称已存在：${name}`)

    const members: GroupMember[] = []
    for (const [index, entry] of request.members.entries()) {
      const memberName = entry.name.trim() || entry.model
      await this.ctx.llm.resolveCallConfig({ provider: entry.provider, model: entry.model })
        .catch((error: unknown) => {
          throw new Error(`成员「${memberName}」的模型路由不可用（${entry.provider}/${entry.model}）：${String(error)}`)
        })
      members.push({
        id: `m-${Date.now().toString(36)}-${index}`,
        name: memberName,
        color: assignColor(index),
        provider: entry.provider,
        model: entry.model,
      })
    }

    const ownerMemberId = request.ownerMemberId ?? members[0]!.id
    if (!members.some(member => member.id === ownerMemberId)) throw new Error('群主必须是群成员')
    const group: GroupRecord = {
      id: `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name, ownerMemberId, members,
      createdAt: new Date().toISOString(),
    }
    this.store.putGroup(group)
    return { group }
  }

  /**
   * Delete one group and its timeline; groups with in-flight tasks are rejected.
   * @param request - the group id.
   * @returns whether the group was deleted.
   */
  @Remote('deleteGroup')
  deleteGroup(request: DeleteGroupRequest): Promise<DeleteGroupValue> {
    const group = this.store.getGroup(request.id)
    if (group === undefined) throw new Error('群组不存在或已被删除')
    const running = this.store.listRunning(request.id).length
    if (running > 0) throw new Error(`群组内有 ${running} 个运行中任务，暂不能删除`)
    this.store.deleteGroup(request.id)
    return Promise.resolve({ deleted: true })
  }

  /**
   * Aggregate the configured LLM routes into a provider-grouped model catalog.
   * @returns the catalog snapshot.
   */
  @Remote('catalog')
  catalog(): Promise<CatalogValue> {
    return this.workers.catalog()
  }

  /**
   * Post one user message and fan it out to the mentioned members.
   * @param request - group id plus raw user text with @mentions.
   * @returns whether the message was recorded.
   */
  @Remote('send')
  send(request: SendRequest): Promise<SendValue> {
    const group = this.store.getGroup(request.groupId)
    if (group === undefined) throw new Error('群组不存在或已被删除')
    if (stripMentions(request.text) !== '') this.workers.dispatch(group, request.text)
    return Promise.resolve({ accepted: true })
  }

  /**
   * Incremental timeline poll of one group: settled rows newer than `after`,
   * plus rows at or below it that are still running or were rewritten since
   * the last poll.
   * @param request - group id and exclusive lower-bound sequence (`-1` for all).
   * @returns the merged rows in seq order.
   */
  @Remote('messages')
  async messages(request: MessagesRequest): Promise<MessagesValue> {
    const fresh = this.store.listAfter(request.groupId, request.after)
    const seen = new Set(fresh.map(message => message.seq))
    const merged = [
      ...this.store.takeSettled(request.groupId).filter(message => !seen.has(message.seq)),
      ...fresh,
      ...this.store.listRunning(request.groupId).filter(message => !seen.has(message.seq)),
    ].sort((left, right) => left.seq - right.seq)
    return { messages: merged }
  }
}
