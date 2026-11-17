/** Scrollable timeline of user and agent bubbles with long-answer collapse. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { GroupMember } from '../shared/groupchat.ts'
import css from './GroupChatBody.module.css'

/** One message in the group chat timeline (client-side view shape). */
export interface ChatMessage {
  readonly id: string
  readonly from: 'user' | 'agent'
  readonly memberId?: string | undefined
  readonly text: string
  readonly time: string
}

export function MessageList(props: Props): ReactNode {
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [props.messages.length, props.pending])
  // Highlight regex follows the active group's roster, rebuilt when it changes.
  const mentionSplit = useMemo(() => new RegExp(`(@(?:${props.members.map(member => member.name).join('|')}))`, 'gi'), [props.members])
  const memberByName = useMemo(() => {
    const map = new Map<string, GroupMember>()
    for (const member of props.members) map.set(member.name.toLowerCase(), member)
    return map
  }, [props.members])
  const withMentions = (text: string): ReactNode => text.split(mentionSplit).map((part, index) => {
    if (!part.startsWith('@')) return part
    const member = memberByName.get(part.slice(1).toLowerCase())
    return member === undefined
      ? part
      : <span key={index} className={css.mention} style={{ color: member.color }}>{part}</span>
  })
  const pendingMember = props.members.find(member => member.id === props.pending)
  return <div className={css.timeline}>
    {props.messages.map(message => message.from === 'user'
      ? <div key={message.id} className={css.rowUser}>
          <div className={css.userBubble}>
            <p className={css.bubbleText}>{withMentions(message.text)}</p>
            <span className={css.time}>{message.time}</span>
          </div>
        </div>
      : <Bubble key={message.id} message={message} members={props.members} props={props} />)}
    {props.pending !== undefined && <div className={css.typing}>
      <span style={{ background: pendingMember?.color }} className={css.avatarSmall} />
      {pendingMember?.name ?? props.pending} {props.typingLabel}
    </div>}
    <div ref={bottom} />
  </div>
}
interface Props {
  readonly messages: readonly ChatMessage[]
  readonly members: readonly GroupMember[]
  readonly pending: string | undefined
  readonly collapseChars: number
  readonly expandLabel: string
  readonly collapseLabel: string
  readonly typingLabel: string
  readonly labels: MarkdownLabels
}

/** A single agent bubble with collapse behavior for long text. */
function Bubble({ message, members, props }: { message: ChatMessage, members: readonly GroupMember[], props: Omit<Props, 'messages' | 'members' | 'pending'> }): ReactNode {
  const [open, setOpen] = useState(false)
  const member = members.find(item => item.id === message.memberId)
  const long = message.text.length > props.collapseChars
  const color = member?.color ?? '#8a93a5'
  const shown = long && !open ? message.text.slice(0, props.collapseChars) : message.text
  return <div className={css.rowAgent}>
    <span className={css.avatar} style={{ background: color }}>{member?.name.slice(0, 1) ?? '?'}</span>
    <div className={css.bubble} style={{ '--member': color, borderColor: `${color}55` } as never}>
      <div className={css.bubbleHead}>
        <span style={{ color }}>{member?.name}</span>
        <span className={css.time}>{message.time}</span>
      </div>
      <div className={css.bubbleMarkdown}>
        <MarkdownText text={shown} labels={props.labels} variant="compact" />
      </div>
      {long && !open && <span className={css.ellipsis}>…</span>}
      {long && <button type="button" className={css.toggle} onClick={() => { setOpen(!open) }}>
        {open ? props.collapseLabel : props.expandLabel}
      </button>}
    </div>
  </div>
}

