/** Group chat tab body: live host timeline with @ mention composer. */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { roster, type GroupChatRemote, type GroupMessage } from '../shared/groupchat.ts'
import { MessageList, type ChatMessage } from './MessageList.tsx'
import { Composer } from './Composer.tsx'
import css from './GroupChatBody.module.css'

/** Long answers beyond this many characters collapse behind a fade. */
const COLLAPSE_CHARS = 400

/** Incremental poll interval while the panel is open. */
const POLL_MS = 1_500

interface Props extends PropsRuntime<'main'>, PropsLocale<'sidebarGroupChat'> {
  /** Host Remote handle injected by the panel registration. */
  readonly groupChat: GroupChatRemote
}

/**
 * Render the group chat panel: timeline fed by the host Remote service plus
 * the composer with @ mention popup. The backend is polled until ready.
 *
 * @param props - sidebar occurrence props plus the injected Remote handle.
 * @returns the two-pane group chat layout.
 */
export function GroupChatBody({ t, groupChat }: Props): ReactNode {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([])
  const [pending, setPending] = useState<string | undefined>(undefined)
  const [online, setOnline] = useState(false)
  const lastSeq = useRef(-1)
  // Reference-stable labels: a new identity discards MarkdownText's streaming render cache.
  const labels = useMemo(() => ({
    code: {
      copyLabel: t('markdown.copy'),
      copiedLabel: t('markdown.copied'),
      toolbarLabels: {
        codeLabel: t('markdown.codeBlock.title'),
        wrapLabel: t('markdown.codeBlock.wrap'),
        unwrapLabel: t('markdown.codeBlock.unwrap'),
      },
    },
    footnotes: t('markdown.footnotes'),
  }), [t])

  /** Merge one poll result into the timeline; running rows drive the typing hint. */
  const applyServer = useCallback((serverMessages: readonly GroupMessage[]): void => {
    if (serverMessages.length === 0) return
    for (const message of serverMessages) {
      if (message.seq > lastSeq.current) lastSeq.current = message.seq
    }
    setMessages(prev => {
      const byId = new Map(prev.map(message => [message.id, message]))
      for (const message of serverMessages) {
        // Running agent rows stay hidden behind the typing hint until done.
        if (message.role === 'agent' && message.state === 'running') continue
        byId.set(message.id, {
          id: message.id,
          from: message.role,
          memberId: message.memberId,
          text: message.text,
          time: new Date(message.createdAt).toTimeString().slice(0, 5),
        })
      }
      return [...byId.values()]
    })
    const running = serverMessages.filter(message => message.role === 'agent' && message.state === 'running')
    setPending(running.length > 0 ? roster.find(member => member.id === running[0]!.memberId)?.name : undefined)
  }, [])

  const pollOnce = useCallback(async (): Promise<boolean> => {
    try {
      const result = await groupChat.messages({ after: lastSeq.current })
      if (!result.ok) throw new Error(result.error.message)
      applyServer(result.value.messages)
      return true
    } catch {
      return false
    }
  }, [applyServer, groupChat])

  // Poll until the backend answers, then keep polling; failures flip to offline.
  useEffect(() => {
    const timer = setInterval(() => {
      void pollOnce().then(ok => { if (ok !== online) setOnline(ok) })
    }, POLL_MS)
    void pollOnce().then(ok => setOnline(ok))
    return () => clearInterval(timer)
  }, [online, pollOnce])

  const send = (text: string): void => {
    void (async () => {
      try {
        const result = await groupChat.send({ text })
        if (!result.ok) throw new Error(result.error.message)
        await pollOnce() // echo the user message immediately instead of waiting a tick
      } catch {
        setOnline(false)
      }
    })()
  }

  return <div className={css.root}>
    {!online && <div className={css.offline}>{t('offline')}</div>}
    <MessageList messages={messages} pending={pending} collapseChars={COLLAPSE_CHARS} expandLabel={t('expand')} collapseLabel={t('collapse')} typingLabel={t('typing')} labels={labels} />
    <Composer members={roster} onSend={send} placeholder={t('placeholder')} sendLabel={t('send')} hint={t('hint')} />
  </div>
}
