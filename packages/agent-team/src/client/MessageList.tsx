/** Scrollable timeline of user and agent bubbles with long-answer collapse. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import { memberOf, roster } from '../shared/groupchat.ts'
import css from './GroupChatBody.module.css'

/** One message in the group chat timeline (client-side view shape). */
export interface ChatMessage {
  readonly id: string
  readonly from: 'user' | 'agent'
  readonly memberId?: string | undefined
  readonly text: string
  readonly time: string
}

const MENTION_SPLIT = new RegExp(`(@(?:${roster.map(member => member.name).join('|')}))`, 'gi')

/**
 * Render text with @mentions highlighted in the mentioned member's color.
 * @param text - raw message text that may contain @mentions.
 * @returns text nodes with mention spans.
 */
function withMentions(text: string): ReactNode {
  return text.split(MENTION_SPLIT).map((part, index) => {
    if (!part.startsWith('@')) return part
    const member = roster.find(item => item.name.toLowerCase() === part.slice(1).toLowerCase())
    return member === undefined
      ? part
      : <span key={index} className={css.mention} style={{ color: member.color }}>{part}</span>
  })
}

interface Props {
  readonly messages: readonly ChatMessage[]
  readonly pending: string | undefined
  readonly collapseChars: number
  readonly expandLabel: string
  readonly collapseLabel: string
  readonly typingLabel: string
  readonly labels: MarkdownLabels
}

/** A single agent bubble with collapse behavior for long text. */
function Bubble({ message, props }: { message: ChatMessage, props: Omit<Props, 'messages' | 'pending'> }): ReactNode {
  const [open, setOpen] = useState(false)
  const member = memberOf(message.memberId)
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

/**
 * Render the message timeline, auto-scrolling to the latest entry.
 * @param props - messages, pending member name and collapse labels.
 * @returns the scrolling timeline.
 */
export function MessageList(props: Props): ReactNode {
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [props.messages.length, props.pending])
  return <div className={css.timeline}>
    {props.messages.map(message => message.from === 'user'
      ? <div key={message.id} className={css.rowUser}>
          <div className={css.userBubble}>
            <p className={css.bubbleText}>{withMentions(message.text)}</p>
            <span className={css.time}>{message.time}</span>
          </div>
        </div>
      : <Bubble key={message.id} message={message} props={props} />)}
    {props.pending !== undefined && <div className={css.typing}>
      <span style={{ background: memberOf(props.pending)?.color }} className={css.avatarSmall} />
      {props.pending} {props.typingLabel}
    </div>}
    <div ref={bottom} />
  </div>
}
