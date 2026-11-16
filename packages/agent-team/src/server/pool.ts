/** Group chat worker pool: one throwaway Session per @mention dispatch. */
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage, type ContextFormed } from '@deepseek-ai/dsh-llm'
import { SessionId, type Session } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type { GroupMember } from '../shared/groupchat.ts'
import { resolveMentions, roster as defaultRoster, stripMentions } from '../shared/groupchat.ts'
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
}

/** Effective member roster after config overlay; resolution happens per dispatch. */
type Roster = readonly GroupMember[] | (() => readonly GroupMember[])

/**
 * Dispatches @mentions to fresh Sessions and projects assistant text back onto
 * the shared timeline. Each member is a fully-capable Agent; there is no
 * resident orchestrator.
 */
export class GroupChatWorkers {
  private readonly tasks = new Map<string, RunningTask>()
  private readonly disposers: (() => void)[] = []
  private sessionController: Context['sessionController'] | undefined

  /**
   * @param ctx - host plugin context used for sessions, LLM validation, and events.
   * @param store - timeline store receiving user/agent messages.
   * @param roster - effective roster or its accessor (config overlay applied).
   */
  constructor(private readonly ctx: Context, private readonly store: GroupChatStore, private readonly roster: Roster = defaultRoster) {}

  /** Track the Web Session controller, which arrives when the web host is ready. */
  start(): void {
    this.ctx.inject(['sessionController'], (webCtx) => {
      webCtx.effect(() => {
        this.sessionController = webCtx.sessionController
        return () => { if (this.sessionController === webCtx.sessionController) this.sessionController = undefined }
      })
    })
    // Fire-and-forget append feed: keep each running row's latest assistant text.
    this.disposers.push(
      this.ctx.on('session/event', (session: Session, event) => {
        if (event.type !== 'assistant/message') return
        const task = this.tasks.get(session.id)
        if (task === undefined) return
        const text = event.data.message.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('')
        if (text.length > 0) task.lastText = text
      }),
    )
  }

  /** Unsubscribe every listener; in-flight runs keep executing but stop projecting. */
  stop(): void {
    for (const dispose of this.disposers.splice(0)) dispose()
  }

  /**
   * Fan one user message out to the mentioned members (no mention = no one).
   * @param text - raw user text with @mentions.
   * @returns the members a message was actually dispatched to.
   */
  dispatch(text: string): readonly GroupMember[] {
    const effective = typeof this.roster === 'function' ? this.roster() : this.roster
    const mentioned = resolveMentions(text).map(member => effective.find(item => item.id === member.id) ?? member)
    const clean = stripMentions(text) || '(空消息)'
    this.store.append({ id: `u-${Date.now().toString(36)}`, role: 'user', text, createdAt: new Date().toISOString() })
    for (const member of mentioned) void this.run(member, clean)
    return mentioned
  }

  /** Create a dedicated Session for one member and submit the task text. */
  private async run(member: GroupMember, taskText: string): Promise<void> {
    const controller = this.sessionController
    if (controller === undefined) {
      this.store.append({
        id: `a-${member.id}-${Date.now().toString(36)}`, role: 'agent', memberId: member.id,
        text: `（Session 控制器不可用，${member.name} 暂时无法上线。）`, state: 'error',
        createdAt: new Date().toISOString(),
      })
      return
    }

    const sessionId = SessionId(`groupchat-${member.id}-${Date.now().toString(36)}`)
    // Register before any await so early events cannot miss the projection.
    this.tasks.set(sessionId, { seq: -1, memberId: member.id, lastText: '' })
    try {
      if (member.provider !== undefined && member.model !== undefined) {
        // Fail fast when an explicitly configured route does not exist before a
        // Session is spent; unconfigured members run on the Session default.
        try {
          await this.ctx.llm.resolveCallConfig({ provider: member.provider, model: member.model })
        } catch (error: unknown) {
          throw new Error(`模型路由不可用（${member.provider}/${member.model}）：${String(error)}`)
        }
      }
      await controller.create({ sessionId })
      const resolved = await controller.resolveAgent(sessionId)
      if ('error' in resolved) throw resolved.error
      const agent: Agent = resolved.agent
      if (member.provider !== undefined && member.model !== undefined) {
        agent.model.select({ provider: member.provider, model: member.model })
      }

      const placeholder = this.store.append({
        id: `a-${member.id}-${Date.now().toString(36)}`, role: 'agent', memberId: member.id,
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
      this.rewrite(sessionId, 'done', task.lastText === '' ? '（该轮没有产生文本回复。）' : task.lastText)
    } catch (error: unknown) {
      this.rewrite(sessionId, 'error', `执行出错：${String(error)}`)
    }
  }

  /** Overwrite the placeholder row with final text and terminal state. */
  private rewrite(sessionId: string, state: 'done' | 'error', text: string): void {
    const task = this.tasks.get(sessionId)
    if (task === undefined) return
    this.tasks.delete(sessionId)
    const stored = this.store.listAfter(task.seq - 1).find(message => message.seq === task.seq)
    if (stored === undefined) return
    this.store.update({ ...stored, text, state })
  }
}
