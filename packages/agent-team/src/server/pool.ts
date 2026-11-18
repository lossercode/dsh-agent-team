/** Group chat worker pool: one throwaway Session per @mention dispatch. */
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage, type ContextFormed } from '@deepseek-ai/dsh-llm'
import { SessionId, type Session } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type { CatalogProvider, CatalogValue, GroupMember } from '../shared/groupchat.ts'
import { resolveMentions, stripMentions } from '../shared/groupchat.ts'
import type { GroupChatStore } from './store.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    groupchat: { kind: 'groupchat' } & ContextFormed
  }
}

/** One in-flight dispatch: the projected message row and its streamed text so far. */
interface RunningTask {
  seq: number
  memberId: string
  lastText: string
  /** Failure message of the latest failed attempt, if any; cleared by a successful reply. */
  error: string | undefined
}

/**
 * Dispatches @mentions to fresh Sessions and projects assistant text back onto
 * the group timeline. Each member is a fully-capable Agent; there is no
 * resident orchestrator.
 */
export class GroupChatWorkers {
  private readonly tasks = new Map<string, RunningTask>()
  private readonly disposers: (() => void)[] = []
  private sessionController: Context['sessionController'] | undefined

  /**
   * @param ctx - host context used for sessions, LLM validation, and events.
   * @param store - group chat store receiving groups, user/agent messages.
   */
  constructor(private readonly ctx: Context, private readonly store: GroupChatStore) {}

  /** Track the Web Session controller, which arrives when the web host is ready. */
  start(): void {
    this.ctx.inject(['sessionController'], (webCtx) => {
      webCtx.effect(() => {
        this.sessionController = webCtx.sessionController
        return () => { if (this.sessionController === webCtx.sessionController) this.sessionController = undefined }
      })
    })
    // Fire-and-forget append feed: keep each running row's latest assistant text,
    // and surface failures from attempts that settle without a message event.
    this.disposers.push(
      this.ctx.on('session/event', (session: Session, event) => {
        const task = this.tasks.get(session.id)
        if (task === undefined) return
        if (event.type === 'assistant/message') {
          const text = event.data.message.content
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('')
          if (text.length > 0) {
            task.lastText = text
            task.error = undefined
          }
          return
        }
        if (event.type === 'assistant/attempt') {
          // A failed attempt never becomes an assistant/message; its terminal
          // finish chunk carries the provider failure we want to show.
          for (const record of event.data.stream) {
            if (record.type !== 'chunk' || record.chunk.type !== 'finish') continue
            const reason = record.chunk.reason
            if (reason.kind === 'error' || reason.kind === 'aborted') {
              task.error = reason.failure.message
            }
          }
        }
      }),
    )
  }

  /** Unsubscribe every listener; in-flight runs keep executing but stop projecting. */
  stop(): void {
    for (const dispose of this.disposers.splice(0)) dispose()
  }

  /**
   * Aggregate the configured LLM routes into a provider-grouped model catalog.
   * Providers whose listing fails degrade to an empty group instead of failing
   * the whole catalog.
   * @returns providers with their model entries, grouped by provider id.
   */
  async catalog(): Promise<CatalogValue> {
    const providers = this.ctx.llm.listProviders()
    const groups = await Promise.all(providers.map(async (provider): Promise<CatalogProvider> => {
      try {
        const models = await this.ctx.llm.listModels(provider.id)
        return {
          provider: provider.id,
          providerName: provider.name,
          models: models.map(model => ({ provider: model.provider, id: model.id, name: model.name })),
        }
      } catch {
        return { provider: provider.id, providerName: provider.name, models: [] }
      }
    }))
    return { providers: groups.filter(group => group.models.length > 0) }
  }

  /**
   * Fan one user message out to the mentioned members of one group.
   * @param group - the group receiving the message.
   * @param text - raw user text with @mentions.
   * @returns the members a message was actually dispatched to.
   */
  dispatch(group: { readonly id: string, readonly members: readonly GroupMember[] }, text: string): readonly GroupMember[] {
    const mentioned = resolveMentions(text, group.members)
    const clean = stripMentions(text) || '(空消息)'
    this.store.append({
      id: `u-${Date.now().toString(36)}`, groupId: group.id, role: 'user', text,
      createdAt: new Date().toISOString(),
    })
    if (mentioned.length === 0) {
      // Visible feedback instead of a silent no-op when no member name matches.
      this.store.append({
        id: `a-none-${Date.now().toString(36)}`, groupId: group.id, role: 'agent',
        text: '（没有 @ 到任何成员：输入 @ 后从补全列表选择，成员名需完整匹配。）', state: 'error',
        createdAt: new Date().toISOString(),
      })
      return mentioned
    }
    for (const member of mentioned) void this.run(group.id, member, clean)
    return mentioned
  }

  /** Create a dedicated Session for one member and submit the task text. */
  private async run(groupId: string, member: GroupMember, taskText: string): Promise<void> {
    const controller = this.sessionController
    if (controller === undefined) {
      this.store.append({
        id: `a-${member.id}-${Date.now().toString(36)}`, groupId, role: 'agent', memberId: member.id,
        text: `（Session 控制器不可用，${member.name} 暂时无法上线。）`, state: 'error',
        createdAt: new Date().toISOString(),
      })
      return
    }

    const sessionId = SessionId(`groupchat-${groupId}-${member.id}-${Date.now().toString(36)}`)
    // Register before any await so early events cannot miss the projection.
    this.tasks.set(sessionId, { seq: -1, memberId: member.id, lastText: '', error: undefined })
    try {
      // Fail fast when the route does not exist before a Session is spent.
      try {
        await this.ctx.llm.resolveCallConfig({ provider: member.provider, model: member.model })
      } catch (error: unknown) {
        throw new Error(`模型路由不可用（${member.provider}/${member.model}）：${String(error)}`)
      }
      await controller.create({ sessionId })
      const resolved = await controller.resolveAgent(sessionId)
      if ('error' in resolved) throw resolved.error
      const agent: Agent = resolved.agent
      agent.model.select({ provider: member.provider, model: member.model })

      const placeholder = this.store.append({
        id: `a-${member.id}-${Date.now().toString(36)}`, groupId, role: 'agent', memberId: member.id,
        sessionId, text: '', state: 'running', createdAt: new Date().toISOString(),
      })
      const task = this.tasks.get(sessionId)
      if (task === undefined) throw new Error('groupchat: task vanished during dispatch')
      task.seq = placeholder.seq

      agent.followup(createUserMessage({
        content: [{ type: 'text', text: taskText }],
        source: { kind: 'groupchat' },
      }))
      const sessions = this.ctx.get('sessions')
      if (sessions !== undefined) void sessions.flush(agent.session)
      // Quiescence of this exact agent is the completion signal; failures above
      // and below already funnel into rewrite.
      await agent.whenIdle()
      if (task.error !== undefined) {
        this.rewrite(sessionId, 'error', `模型调用失败：${task.error}`)
      } else {
        this.rewrite(sessionId, 'done', task.lastText === '' ? '（该轮没有产生文本回复。）' : task.lastText)
      }
    } catch (error: unknown) {
      this.rewrite(sessionId, 'error', `执行出错：${String(error)}`)
    }
  }

  /** Overwrite the placeholder row with final text and terminal state. */
  private rewrite(sessionId: string, state: 'done' | 'error', text: string): void {
    const task = this.tasks.get(sessionId)
    if (task === undefined) return
    this.tasks.delete(sessionId)
    const stored = this.store.getMessage(task.seq)
    if (stored === undefined) return
    this.store.update({ ...stored, text, state })
  }
}
