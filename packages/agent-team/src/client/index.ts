/** Register the multi-agent group chat as a global left-nav panel. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@lossercode/dsh-agent-team/remote'
import groupChatRemote from '@lossercode/dsh-agent-team/remote'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the 'groupchat.member.conversation' SlotMap row into scope.
import type {} from './MemberConversation.tsx'
import { GroupChatBody } from './GroupChatBody.tsx'
import { MemberConversation } from './MemberConversation.tsx'
import { GroupChatIcon } from './GroupChatIcon.tsx'
import { en, zh } from './locales.ts'

/** Services needed to mount the Remote handle and the group chat's shell seats. */
export const inject = ['remote', 'slots', 'locale', 'sessions']

/** UI lifetime injects: the dotted namespace entry licenses `remote.groupChat` access. */
const UI_INJECT = ['remote', 'remote.groupChat', 'slots', 'locale', 'sessions']

/** Panel id shared by the sidebar entry and the main-slot page. */
const PANEL_ID = 'groupchat' as MainPanelId

/**
 * Register the group chat entry and its main-area panel page inside a child
 * lifetime whose teardown precedes the Remote namespace unmount.
 * @param child - child context carrying locale and slot services.
 */
function registerUi(child: Context): void {
  const namespace = 'sidebarGroupChat'
  const t = child.locale.bind(namespace)
  child.effect(() => child.locale.register(namespace, { zh, en }), 'dsh-agent-team.copy')
  child.effect(() => child.slots.inject('sidebar.panellist', () => child.slots.register(
    { name: 'sidebar.panellist', id: PANEL_ID, order: 20, locale: namespace, label: () => t('title') }, GroupChatIcon,
  )), 'dsh-agent-team.entry')
  child.effect(() => child.slots.inject('main', () => child.slots.register(
    {
      name: 'main',
      key: PANEL_ID,
      locale: namespace,
      inject: () => ({ groupChat: child.remote.groupChat, sessions: child.sessions }),
      children: { 'groupchat.member.conversation': { kind: 'single', scope: 'session' } },
    },
    GroupChatBody,
  )), 'dsh-agent-team.page')
  // One member bubble hosts the official Conversation body for its Session.
  child.effect(() => child.slots.inject('groupchat.member.conversation', () => child.slots.register(
    { name: 'groupchat.member.conversation' }, MemberConversation,
  )), 'dsh-agent-team.member.conversation')
}

/**
 * Mount the generated Host Remote contribution, then the group chat UI; the
 * returned disposer withdraws the UI before the namespace.
 * @param ctx - Client root Context with shell services.
 * @returns disposer that removes both contributions.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const unmountRemote = await ctx.remote.$mount(groupChatRemote)
  const ui = ctx.inject(UI_INJECT, child => registerUi(child))
  try { await ui } catch (error) {
    await ui.dispose()
    await unmountRemote()
    throw error
  }
  return async () => {
    await ui.dispose()
    await unmountRemote()
  }
}
