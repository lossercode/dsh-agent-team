/** Composer with textarea, @ mention popup and send button. */
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { memberLabel, mentionToken, type GroupMember } from '../shared/groupchat.ts'
import css from './GroupChatBody.module.css'

/** Zero-width marker pair bounding the member id inside one mention token. */
const TOKEN_OPEN = '\u2063'
const TOKEN_CLOSE = '\u2064'

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
 * Selecting an option inserts a token — the visible label plus a hidden member id —
 * so the host resolves the id instead of re-matching the display text.
 * @param props - member roster and composer labels.
 * @returns the composer row.
 */
export function Composer({ members, onSend, placeholder, sendLabel, hint, mentionNoneLabel }: Props): ReactNode {
  const [text, setText] = useState('')
  const [popup, setPopup] = useState(false)
  const [cursor, setCursor] = useState(0)
  const input = useRef<HTMLTextAreaElement>(null)

  /**
   * Find the `@query` being typed at the caret.
   * @returns the query text, `''` right after an `@`, or null when no popup applies.
   */
  const mentionQuery = (): string | null => {
    const caret = input.current?.selectionStart ?? text.length
    const before = text.slice(0, caret)
    // A closed token ends any active query: an @ inside an already-chosen
    // mention must not reopen the popup.
    const tokenEnd = before.lastIndexOf(TOKEN_CLOSE)
    const at = before.lastIndexOf('@')
    if (at === -1 || at < tokenEnd) return null
    if (at > 0 && !/[\s\u2064]/.test(before[at - 1]!)) return null
    const tail = before.slice(at + 1)
    // Anything but another @ stays part of the query (labels contain spaces).
    if (tail.includes('@') || tail.includes(TOKEN_OPEN)) return null
    return tail
  }
  const query = mentionQuery()
  const visible = popup && query !== null
  const options = query === null
    ? []
    : members.filter(member => memberLabel(member).toLowerCase().includes(query.toLowerCase()))
  const select = (member: GroupMember): void => {
    const caret = input.current?.selectionStart ?? text.length
    const before = text.slice(0, caret)
    const at = before.lastIndexOf('@')
    const head = at === -1 ? text : text.slice(0, at)
    const rest = at === -1 ? '' : text.slice(caret)
    const next = `${head}${mentionToken(member)} ${rest}`
    setText(next)
    setPopup(false)
    setCursor(0)
    // Put the caret after the inserted token instead of at the end.
    const position = head.length + mentionToken(member).length + 1
    requestAnimationFrame(() => {
      const element = input.current
      if (element === null) return
      element.focus()
      element.setSelectionRange(position, position)
    })
  }
  const submit = (): void => {
    if (text.trim() === '') return
    onSend(text)
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
  // Backspace inside a token removes the whole mention, matching an atomic chip.
  const beforeInput = (event: React.FormEvent<HTMLTextAreaElement>): void => {
    const native = event.nativeEvent as InputEvent
    if (native.inputType !== 'deleteContentBackward') return
    const caret = input.current?.selectionStart ?? 0
    const open = text.lastIndexOf(TOKEN_OPEN, caret - 1)
    if (open === -1) return
    const close = text.indexOf(TOKEN_CLOSE, open)
    if (close === -1 || close >= caret) return
    event.preventDefault()
    const next = `${text.slice(0, open)}${text.slice(close + 1)}`
    setText(next)
    requestAnimationFrame(() => {
      const element = input.current
      if (element === null) return
      element.setSelectionRange(open, open)
    })
  }

  return <div className={css.composerWrap}>
    {visible && <div className={css.popup} role="listbox">
      {options.map((member, index) => <button type="button" key={member.id} role="option"
        aria-selected={index === cursor}
        className={index === cursor ? css.optionActive : css.option}
        onMouseEnter={() => { setCursor(index) }}
        onMouseDown={event => { event.preventDefault(); select(member) }}>
        <span className={css.avatarSmall} style={{ background: member.color }} />
        {memberLabel(member)}
      </button>)}
      {options.length === 0 && <div className={css.optionNone}>{mentionNoneLabel}</div>}
    </div>}
    <div className={css.composer}>
      <div className={css.card}>
        <textarea ref={input} className={css.input} rows={2} placeholder={placeholder} value={text}
          onChange={event => { setText(event.target.value); setCursor(0); setPopup(true) }}
          onBeforeInput={beforeInput}
          onKeyDown={keydown} aria-label={placeholder} />
        <div className={css.composerMeta}>
          <span className={css.hint}>{hint}</span>
          <Button variant="primary" size="sm" onClick={submit} disabled={text.trim() === ''}>{sendLabel}</Button>
        </div>
      </div>
    </div>
  </div>
}
