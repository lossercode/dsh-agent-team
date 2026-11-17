/** Group chat tab body: group sidebar + per-group timeline with @ mention composer. */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { type GroupChatRemote, type GroupMember, type GroupRecord, type GroupMessage } from '../shared/groupchat.ts'
import { MessageList, type ChatMessage } from './MessageList.tsx'
import { Composer } from './Composer.tsx'
import { CreateGroupDialog } from './CreateGroupDialog.tsx'
import css from './GroupChatBody.module.css'

/** Long answers beyond this many characters collapse behind a fade. */
const COLLAPSE_CHARS = 400

/** Incremental poll interval while the panel is open. */
const POLL_MS = 1_500

/** How long a delete failure (running tasks) stays visible in the sidebar. */
const DELETE_ERROR_MS = 2_500

interface Props extends PropsRuntime<'main'>, PropsLocale<'sidebarGroupChat'> {
  /** Host Remote handle injected by the panel registration. */
  readonly groupChat: GroupChatRemote
}

/**
 * Render the two-pane group chat: group list with create/delete on the left,
 * the active group's timeline plus composer on the right.
 *
 * @param props - main-slot occurrence props plus the injected Remote handle.
 * @returns the two-pane group chat layout.
 */
export function GroupChatBody({ t, groupChat }: Props): ReactNode {
  const [groups, setGroups] = useState<readonly GroupRecord[]>([])
  const [activeId, setActiveId] = useState<string | undefined>(undefined)
  const [messages, setMessages] = useState<readonly ChatMessage[]>([])
  const [pending, setPending] = useState<string | undefined>(undefined)
  const [online, setOnline] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | undefined>(undefined)
  const [deleteError, setDeleteError] = useState<string | undefined>(undefined)
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

  const active = groups.find(group => group.id === activeId)
  const members = useMemo<readonly GroupMember[]>(() => active?.members ?? [], [active])

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
    setPending(running.length > 0 ? running[0]!.memberId : undefined)
  }, [])

  const pollOnce = useCallback(async (): Promise<boolean> => {
    try {
      const groupsResult = await groupChat.groups()
      if (!groupsResult.ok) throw new Error(groupsResult.error.message)
      setGroups(groupsResult.value.groups)
      if (activeId !== undefined) {
        const messagesResult = await groupChat.messages({ groupId: activeId, after: lastSeq.current })
        if (!messagesResult.ok) throw new Error(messagesResult.error.message)
        applyServer(messagesResult.value.messages)
      }
      return true
    } catch {
      return false
    }
  }, [activeId, applyServer, groupChat])

  // Poll until the backend answers, then keep polling; failures flip to offline.
  useEffect(() => {
    const timer = setInterval(() => {
      void pollOnce().then(ok => { if (ok !== online) setOnline(ok) })
    }, POLL_MS)
    void pollOnce().then(ok => setOnline(ok))
    return () => clearInterval(timer)
  }, [online, pollOnce])

  // Keep the active group valid as groups come and go; reset the timeline on switch.
  useEffect(() => {
    setActiveId(prev => {
      if (prev !== undefined && groups.some(group => group.id === prev)) return prev
      return groups[0]?.id
    })
  }, [groups])

  useEffect(() => {
    lastSeq.current = -1
    setMessages([])
    setPending(undefined)
  }, [activeId])

  useEffect(() => {
    if (deleteError === undefined) return
    const timer = setTimeout(() => { setDeleteError(undefined) }, DELETE_ERROR_MS)
    return () => { clearTimeout(timer) }
  }, [deleteError])

  const send = (text: string): void => {
    if (activeId === undefined) return
    void (async () => {
      try {
        const result = await groupChat.send({ groupId: activeId, text })
        if (!result.ok) throw new Error(result.error.message)
        await pollOnce() // echo the user message immediately instead of waiting a tick
      } catch {
        setOnline(false)
      }
    })()
  }

  const deleteGroup = (id: string): void => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id)
      return
    }
    setDeleteConfirmId(undefined)
    void (async () => {
      try {
        const result = await groupChat.deleteGroup({ id })
        if (!result.ok) throw new Error(result.error.message)
      } catch {
        setDeleteError(t('deleteBlocked'))
      }
    })()
  }

  const createDone = (): void => {
    void pollOnce()
  }

  return <div className={css.root}>
    {!online && <div className={css.offline}>{t('offline')}</div>}
    <div className={css.columns}>
      <aside className={css.sidebar}>
        <div className={css.sidebarHead}>
          <span>{t('groups')}</span>
          <button type="button" className={css.addButton} title={t('createGroup')}
            aria-label={t('createGroup')} onClick={() => { setDialogOpen(true) }}>+</button>
        </div>
        <div className={css.groupRows}>
          {groups.map(group => <button type="button" key={group.id}
            className={group.id === activeId ? css.groupRowActive : css.groupRow}
            onClick={() => { setActiveId(group.id); setDeleteConfirmId(undefined) }}>
            <span className={css.groupRowName}>{group.name}</span>
            <span className={css.groupRowMeta}>
              {group.members.length} {t('memberCount')}
              <span className={css.ownerCrown} title={t('ownerBadge')}>★</span>
            </span>
            <span role="button" tabIndex={-1}
              className={deleteConfirmId === group.id ? `${css.groupDelete} ${css.groupDeleteConfirm}` : css.groupDelete}
              title={deleteConfirmId === group.id ? t('deleteConfirm') : t('deleteGroup')}
              aria-label={t('deleteGroup')}
              onClick={event => { event.stopPropagation(); deleteGroup(group.id) }}>
              {deleteConfirmId === group.id ? '!' : '×'}
            </span>
          </button>)}
          {groups.length === 0 && <div className={css.sidebarEmpty}>
            <span>{t('groupsEmpty')}</span>
            <span className={css.emptyPaneHint}>{t('groupsEmptyHint')}</span>
          </div>}
        </div>
        {deleteError !== undefined && <div className={css.dialogError}>{deleteError}</div>}
      </aside>
      {active === undefined
        ? <div className={css.emptyPane}><div className={css.emptyPaneInner}>
            <span>{groups.length === 0 ? t('groupsEmpty') : t('noGroupSelected')}</span>
            <span className={css.emptyPaneHint}>{t('groupsEmptyHint')}</span>
          </div></div>
        : <div className={css.chat}>
          <MessageList messages={messages} members={members} pending={pending} collapseChars={COLLAPSE_CHARS}
            expandLabel={t('expand')} collapseLabel={t('collapse')} typingLabel={t('typing')} labels={labels} />
          <Composer members={members} onSend={send} placeholder={t('placeholder')} sendLabel={t('send')}
            hint={t('hint')} mentionNoneLabel={t('mentionNone')} />
        </div>}
    </div>
    {dialogOpen && <CreateGroupDialog groupChat={groupChat} onClose={() => { setDialogOpen(false) }}
      onCreated={createDone}
      labels={{
        title: t('dialogTitle'),
        nameLabel: t('dialogNameLabel'),
        namePlaceholder: t('dialogNamePlaceholder'),
        membersLabel: t('dialogMembersLabel'),
        ownerLabel: t('dialogOwnerLabel'),
        loading: t('dialogLoading'),
        loadError: t('dialogLoadError'),
        noModels: t('dialogNoModels'),
        memberNamePlaceholder: t('dialogMemberNamePlaceholder'),
        create: t('dialogCreate'),
        cancel: t('dialogCancel'),
      }} />}
  </div>
}
