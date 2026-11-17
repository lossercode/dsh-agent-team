/** Composer with textarea, @ mention popup and send button. */
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { GroupMember } from '../shared/groupchat.ts'
import css from './GroupChatBody.module.css'

interface Props {
  readonly members: readonly GroupMember[]
  readonly onSend: (text: string) => void
  readonly placeholder: string
  readonly sendLabel: string
  readonly hint: string
  readonly mentionNoneLabel: string
}

/**
 * Render the input area: Enter sends, Shift+Enter breaks lines, @ opens the member popup.
 * @param props - member roster and composer labels.
 * @returns the composer row.
 */
export function Composer({ members, onSend, placeholder, sendLabel, hint, mentionNoneLabel }: Props): ReactNode {
  const [text, setText] = useState('')
  const [popup, setPopup] = useState(false)
  const [cursor, setCursor] = useState(0)

  const mentionQuery = (): string | null => {
    const at = text.lastIndexOf('@')
    if (at === -1) return null
    const tail = text.slice(at + 1)
    return /(^|\s)@([\w\u4e00-\u9fa5-]*)$/.test(text.slice(Math.max(0, at - 1))) || tail === '' ? tail : null
  }
  const query = mentionQuery()
  const visible = popup && query !== null
  const options = query === null ? [] : members.filter(member => member.name.toLowerCase().includes(query.toLowerCase()))
  const select = (member: GroupMember): void => {
    const at = text.lastIndexOf('@')
    setText(`${text.slice(0, at)}@${member.name} `)
    setPopup(false)
  }
  const submit = (): void => {
    const value = text.trim()
    if (value === '') return
    onSend(value)
    setText('')
    setPopup(false)
  }
  const keydown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (visible && options.length > 0) {
      if (event.key === 'ArrowDown') { event.preventDefault(); setCursor(Math.min(cursor + 1, options.length - 1)); return }
      if (event.key === 'ArrowUp') { event.preventDefault(); setCursor(Math.max(cursor - 1, 0)); return }
      if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) { event.preventDefault(); select(options[cursor]!); return }
      if (event.key === 'Escape') { setPopup(false); return }
    }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() }
  }

  return <div className={css.composerWrap}>
    {visible && <div className={css.popup} role="listbox">
      {options.map((member, index) => <button type="button" key={member.id} role="option"
        aria-selected={index === cursor}
        className={index === cursor ? css.optionActive : css.option}
        onMouseEnter={() => { setCursor(index) }}
        onMouseDown={event => { event.preventDefault(); select(member) }}>
        <span className={css.avatarSmall} style={{ background: member.color }} />
        {member.name}
      </button>)}
      {options.length === 0 && <div className={css.optionNone}>{mentionNoneLabel}</div>}
    </div>}
    <div className={css.composer}>
      <div className={css.card}>
        <textarea className={css.input} rows={2} placeholder={placeholder} value={text}
          onChange={event => { setText(event.target.value); setCursor(0); setPopup(true) }}
          onKeyDown={keydown} aria-label={placeholder} />
        <div className={css.composerMeta}>
          <span className={css.hint}>{hint}</span>
          <Button variant="primary" size="sm" onClick={submit} disabled={text.trim() === ''}>{sendLabel}</Button>
        </div>
      </div>
    </div>
  </div>
}
