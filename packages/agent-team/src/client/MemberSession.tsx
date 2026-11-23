/** Retain one member Session and render it through the official Conversation slot. */
import { useEffect, useState, type ReactNode } from 'react'
import type {
  ISessions, SessionReference,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionProviderComponent } from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    /** A group chat member bubble inspecting its own reply. */
    groupchatMember: unknown
  }
}

interface Props {
  readonly sessionId: string
  readonly SessionProvider: SessionProviderComponent
  /** The member Conversation slot, rendered under the retained reference. */
  readonly children: ReactNode
  /** Sessions service used to retain the reply's Session. */
  readonly sessions: ISessions
}

/**
 * Hold one Session reference for as long as its bubble is mounted, then render
 * the member Conversation scoped to that reference.
 *
 * A reply's Session is created on the Host, so the Client list may not know it
 * yet and retention fails with "unknown session". The Client never refreshes
 * that list on its own, so the first failure refreshes once and retries.
 * @param props - target Session id, scoped children, and the sessions face.
 * @returns the scoped Conversation, or a short reason when it cannot open.
 */
export function MemberSession({ sessionId, SessionProvider, children, sessions }: Props): ReactNode {
  const [reference, setReference] = useState<SessionReference | undefined>(undefined)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  useEffect(() => {
    let alive = true
    let held: SessionReference | undefined

    const retain = (): SessionReference =>
      sessions.retain(sessionId as SessionId, { source: 'groupchatMember' })

    const run = async (): Promise<void> => {
      try {
        held = retain()
      } catch {
        // The Host owns this Session; teach the Client list about it, then retry.
        await sessions.refresh().catch(() => {})
        if (!alive) return
        try {
          held = retain()
        } catch (error: unknown) {
          if (alive) setFailure(error instanceof Error ? error.message : String(error))
          return
        }
      }
      if (!alive) {
        held.release()
        return
      }
      setReference(held)
    }
    void run()

    return () => {
      alive = false
      held?.release()
    }
  }, [sessions, sessionId])

  if (failure !== undefined) return <div data-groupchat-session-error="">{failure}</div>
  if (reference === undefined) return null
  return <SessionProvider session={reference}>{children}</SessionProvider>
}
