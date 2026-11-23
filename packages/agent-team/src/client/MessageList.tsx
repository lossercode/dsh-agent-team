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
  /** Session backing an agent reply; its live Conversation is embedded on demand. */
  readonly sessionId?: string | undefined
  readonly text: string
  readonly time: string
}

export function MessageList(props: Props): ReactNode {
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [props.messages.length, props.pending])
  const memberById = useMemo(() => {
    const map = new Map<string, GroupMember>()
    for (const member of props.members) map.set(member.id, member)
    return map
  }, [props.members])
  // Tokens carry the member id, so highlighting never depends on label text.
  const withMentions = (text: string): ReactNode => renderMentions(text, memberById)
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

/** Zero-width marker pair wrapping a member id: `@<label>` + open + id + close. */
const TOKEN = /@([^\u2063\u2064]*)\u2063([^\u2064]*)\u2064/g

/** Highlight member chips and drop leftover markers from foreign text. */
function renderMentions(text: string, memberById: ReadonlyMap<string, GroupMember>): ReactNode {
  const parts: ReactNode[] = []
  let last = 0
  let key = 0
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const member = memberById.get(match[2]!)
    const shown = `@${match[1]!}`
    parts.push(member === undefined
      ? shown
      : <span key={key++} className={css.mention} style={{ color: member.color }}>{shown}</span>)
    last = match.index + match[0].length
  }
  const tail = text.slice(last)
  if (tail.length > 0) parts.push(tail)
  return parts
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
  /** Render an agent reply's live Session body, when the reply names one. */
  readonly renderSession: (message: ChatMessage) => ReactNode
  /** Toggle label that switches a bubble to its full Session view. */
  readonly detailLabel: string
  /** Label returning the bubble to its text summary. */
  readonly summaryLabel: string
}

/** A single agent bubble: text summary, or the full Session view on demand. */
function Bubble({ message, members, props }: { message: ChatMessage, members: readonly GroupMember[], props: Omit<Props, 'messages' | 'members' | 'pending'> }): ReactNode {
  const [open, setOpen] = useState(false)
  const [detailed, setDetailed] = useState(false)
  const member = members.find(item => item.id === message.memberId)
  const long = message.text.length > props.collapseChars
  const color = member?.color ?? '#8a93a5'
  const shown = long && !open ? message.text.slice(0, props.collapseChars) : message.text
  const canDetail = message.sessionId !== undefined
  return <div className={css.rowAgent}>
    <span className={css.avatar} style={{ background: color }}>{member?.name.slice(0, 1) ?? '?'}</span>
    <div className={css.bubble} style={{ '--member': color, borderColor: `${color}55` } as never}>
      <div className={css.bubbleHead}>
        <span style={{ color }}>{member?.name}</span>
        <span className={css.time}>{message.time}</span>
        {canDetail && <button type="button" className={css.toggle} onClick={() => { setDetailed(!detailed) }}>
          {detailed ? props.summaryLabel : props.detailLabel}
        </button>}
      </div>
      {detailed && canDetail
        // The official Conversation body shows thinking, tool calls, and step
        // progress; the text summary below is only the host's last projection.
        ? <div className={css.sessionHost}>{props.renderSession(message)}</div>
        : <>
            <div className={css.bubbleMarkdown}>
              <MarkdownText text={shown} labels={props.labels} variant="compact" />
            </div>
            {long && !open && <span className={css.ellipsis}>…</span>}
            {long && <button type="button" className={css.toggle} onClick={() => { setOpen(!open) }}>
              {open ? props.collapseLabel : props.expandLabel}
            </button>}
          </>}
    </div>
  </div>
}

