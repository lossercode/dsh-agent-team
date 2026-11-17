/** Create-group dialog: pick models from the host catalog, name them, choose the owner. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CatalogModel, CatalogProvider, CreateGroupMember, GroupChatRemote } from '../shared/groupchat.ts'
import { assignColor } from '../shared/groupchat.ts'
import css from './GroupChatBody.module.css'

/** Local draft of one selected model, before the host assigns ids. */
interface Draft {
  readonly key: string
  readonly provider: string
  readonly model: string
  readonly modelId: string
  readonly providerName: string
  name: string
}

interface Props {
  readonly groupChat: GroupChatRemote
  readonly labels: {
    readonly title: string
    readonly nameLabel: string
    readonly namePlaceholder: string
    readonly membersLabel: string
    readonly ownerLabel: string
    readonly loading: string
    readonly loadError: string
    readonly noModels: string
    readonly memberNamePlaceholder: string
    readonly create: string
    readonly cancel: string
  }
  readonly onClose: () => void
  readonly onCreated: () => void
}

/**
 * Render the create-group overlay: catalog-driven member checklist plus an
 * editable draft name per member; owner defaults to the first member.
 *
 * @param props - remote handle, dialog labels, close and success callbacks.
 * @returns the modal overlay.
 */
export function CreateGroupDialog({ groupChat, labels, onClose, onCreated }: Props): ReactNode {
  const [name, setName] = useState('')
  const [providers, setProviders] = useState<readonly CatalogProvider[] | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const [drafts, setDrafts] = useState<readonly Draft[]>([])
  const [owner, setOwner] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    let alive = true
    groupChat.catalog().then(result => {
      if (!alive) return
      if (!result.ok) throw new Error(result.error.message)
      setProviders(result.value.providers)
    }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false; aliveRef.current = false }
  }, [groupChat])

  const toggle = (model: CatalogModel, providerName: string): void => {
    const key = `${model.provider}::${model.id}`
    setDrafts(prev => {
      const exists = prev.some(draft => draft.key === key)
      if (exists) {
        const next = prev.filter(draft => draft.key !== key)
        if (owner === key) setOwner(next[0]?.key)
        return next
      }
      const draft: Draft = {
        key,
        provider: model.provider,
        model: model.name,
        modelId: model.id,
        providerName,
        name: model.name,
      }
      if (owner === undefined) setOwner(key)
      return [...prev, draft]
    })
  }

  const rename = (key: string, value: string): void => {
    setDrafts(prev => prev.map(draft => draft.key === key ? { ...draft, name: value } : draft))
  }

  const submit = (): void => {
    // Owner becomes the first member: the host defaults ownerMemberId to members[0],
    // and ids/color positions are host-assigned at creation time.
    const ordered = [...drafts].sort((a, b) => (a.key === owner ? -1 : 0) - (b.key === owner ? -1 : 0))
    const members: CreateGroupMember[] = ordered.map(draft => ({
      name: draft.name.trim() || draft.model,
      provider: draft.provider,
      model: draft.modelId,
    }))
    setBusy(true)
    setError(undefined)
    void (async () => {
      try {
        const result = await groupChat.createGroup({ name: name.trim(), members })
        if (!result.ok) throw new Error(result.error.message)
        onCreated()
        onClose()
      } catch (err) {
        if (aliveRef.current) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (aliveRef.current) setBusy(false)
      }
    })()
  }

  return <div className={css.dialogOverlay} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className={css.dialog} role="dialog" aria-label={labels.title}>
      <h3 className={css.dialogTitle}>{labels.title}</h3>
      <div className={css.dialogField}>
        <span className={css.dialogLabel}>{labels.nameLabel}</span>
        <input className={css.dialogText} value={name} placeholder={labels.namePlaceholder}
          onChange={event => { setName(event.target.value) }} aria-label={labels.nameLabel} />
      </div>
      <div className={css.dialogField}>
        <span className={css.dialogLabel}>{labels.membersLabel}</span>
        <div className={css.dialogList}>
          {providers === undefined && !failed && <div className={css.dialogHint}>{labels.loading}</div>}
          {failed && <div className={css.dialogError}>{labels.loadError}</div>}
          {providers?.length === 0 && <div className={css.dialogHint}>{labels.noModels}</div>}
          {providers?.map(provider => <div key={provider.provider} className={css.catalogProvider}>
            <span className={css.catalogProviderName}>{provider.providerName}</span>
            {provider.models.map(model => {
              const key = `${model.provider}::${model.id}`
              const checked = drafts.some(draft => draft.key === key)
              return <button type="button" key={key}
                className={checked ? `${css.catalogModelRow} ${css.catalogModelChecked}` : css.catalogModelRow}
                onClick={() => { toggle(model, provider.providerName) }}>
                <span className={css.catalogCheck} aria-hidden>{checked ? '✓' : ''}</span>
                <span className={css.catalogModelName}>{model.name}</span>
                <span className={css.catalogModelId}>{model.id}</span>
              </button>
            })}
          </div>)}
        </div>
      </div>
      {drafts.length > 0 && <div className={css.dialogField}>
        <span className={css.dialogLabel}>{labels.ownerLabel}</span>
        <div className={css.memberRows}>
          {drafts.map((draft, index) => <div key={draft.key} className={css.memberRow}>
            <button type="button"
              className={owner === draft.key ? `${css.memberOwnerButton} ${css.memberOwnerActive}` : css.memberOwnerButton}
              title={labels.ownerLabel}
              onClick={() => { setOwner(draft.key) }}>★</button>
            <span className={css.avatarSmall} style={{ background: assignColor(index) }} />
            <input className={css.memberNameInput} value={draft.name}
              placeholder={labels.memberNamePlaceholder} aria-label={labels.memberNamePlaceholder}
              onChange={event => { rename(draft.key, event.target.value) }} />
            <span className={css.memberRoute}>{draft.providerName} / {draft.modelId}</span>
          </div>)}
        </div>
      </div>}
      {error !== undefined && <div className={css.dialogError}>{error}</div>}
      <div className={css.dialogActions}>
        <Button variant="ghost" size="sm" onClick={onClose}>{labels.cancel}</Button>
        <Button variant="primary" size="sm" onClick={submit}
          disabled={busy || name.trim() === '' || drafts.length === 0}>{labels.create}</Button>
      </div>
    </div>
  </div>
}
