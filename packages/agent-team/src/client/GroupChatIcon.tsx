/** Decorative occupant for the group chat sidebar entry. */
import { IconNewChatOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the chat glyph at the size the sidebar asks for; the sidebar owns
 * the row's accessible navigation label.
 * @param props - the sidebar's icon share: requested edge, active flag.
 * @returns decorative chat icon.
 */
export function GroupChatIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <IconNewChatOutlineRegular size={size} />
}
