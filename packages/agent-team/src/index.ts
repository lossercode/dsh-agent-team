/** Host-side entry: a Typert Remote Service owning the group chat timeline. */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { MessagesRequest, MessagesValue, SendRequest, SendValue } from './types.ts'
import { withOverrides } from './shared/groupchat.ts'
import { GroupChatStore } from './server/store.ts'
import { GroupChatWorkers } from './server/pool.ts'

export type * from './types.ts'

/** Optional member model routing overlaid onto the default roster; both fields required. */
export interface Config {
  readonly members?: Readonly<Record<string, { provider: string, model: string }>>
}

/**
 * Group chat backend as a class plugin: one Remote Service exposing `send`
 * and `messages` over the official client-host RPC channel. Each @mention
 * dispatches through the built-in Session engine; no HTTP surface is owned.
 */
export default class GroupChatService extends TypertRemoteService {
  static inject = ['llm', 'storageDomain']

  static Config: z<Config, Config> = z.object({
    members: z.dict(z.object({
      provider: z.string().required(),
      model: z.string().required(),
    })),
  })

  private readonly store = new GroupChatStore()
  private readonly workers: GroupChatWorkers

  /**
   * @param ctx - Host context carrying the LLM resolver and storage domain.
   * @param config - Validated member model routing overrides.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'groupChat')
    this.workers = new GroupChatWorkers(ctx, this.store, () => withOverrides(config.members ?? {}))
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
   * Post one user message and fan it out to the mentioned members.
   * @param request - raw user text with @mentions.
   * @returns whether the message was recorded.
   */
  @Remote('send')
  send(request: SendRequest): Promise<SendValue> {
    this.workers.dispatch(request.text)
    return Promise.resolve({ accepted: true })
  }

  /**
   * Incremental timeline poll: settled rows newer than `after`, plus rows at
   * or below it that are still running or were rewritten since the last poll.
   * @param request - exclusive lower-bound sequence (`-1` for everything).
   * @returns the merged rows in seq order.
   */
  @Remote('messages')
  async messages(request: MessagesRequest): Promise<MessagesValue> {
    const fresh = this.store.listAfter(request.after)
    const seen = new Set(fresh.map(message => message.seq))
    const merged = [
      ...this.store.takeSettled().filter(message => !seen.has(message.seq)),
      ...fresh,
      ...this.store.listRunning().filter(message => !seen.has(message.seq)),
    ].sort((left, right) => left.seq - right.seq)
    return { messages: merged }
  }
}
