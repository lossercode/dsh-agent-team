/** A member's live Session rendered with the main conversation's own view. */
import type { ReactNode } from 'react'
import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {
  ConversationSnapshot, ConversationViewsProps,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  PropsRenderFactories, PropsRenderSlots, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * Session-scoped Conversation occurrence hosted by one group chat member
     * bubble. Declaring `conversation.session` as a child authorizes delegating
     * to the official Conversation body.
     */
    'groupchat.member.conversation': {
      kind: 'single'
      scope: 'session'
      children: { 'conversation.session': { kind: 'single'; scope: 'session' } }
    }
  }
}

/** Fixed Chat selection used by the embedded Conversation occurrence. */
function FixedChatConversationView(props: ConversationViewsProps): ReactNode {
  return <>{props.renderSlot('conversation.session', { view: 'chat' })}</>
}

/** Props supplied to the embedded Conversation host. */
export type MemberConversationProps =
  PropsRuntime<'groupchat.member.conversation'>
  & PropsRenderFactories
  & PropsRenderSlots<'conversation.session'>

/**
 * Render one member Session through the official Conversation content, so a
 * bubble shows the same thinking, tool-call, and progress rendering as the
 * main panel instead of a text-only snapshot.
 * @param props - session-scoped runtime props plus the Conversation factory.
 * @returns the embedded conversation content.
 */
export function MemberConversation({
  useSession, useConversation, renderFactorySlot,
}: MemberConversationProps): ReactNode {
  const session = useSession((value: SessionSnapshot) => value)
  const conversation = useConversation((value: ConversationSnapshot) => value)
  // Mirror the subagent sidebar's derivation: a busy member must read as active
  // while its first token is in flight, and only a truly blank one is `hero`.
  const shellActive = conversation.activeTargets.size > 0
    || (!session.blank && !session.awaitingFirstTurn)
    || session.running
  const phase: 'active' | 'hero' = shellActive ? 'active' : 'hero'
  return renderFactorySlot('conversation.content', { variant: 'embedded', phase, hero: false }, {
    slots: { views: FixedChatConversationView },
  })
}
