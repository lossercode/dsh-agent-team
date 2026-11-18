/** Group member matching helpers shared by the host orchestrator and the web panel. */
import type { GroupMember } from '../types.ts'

export type * from '../types.ts'

/** Accent colors cycled by member position; kept vivid on dark surfaces. */
export const MEMBER_COLORS: readonly string[] = [
  '#4d6bfe', '#14b8a6', '#10a37f', '#f5b642', '#e06c9f',
  '#8b5cf6', '#f97316', '#38bdf8', '#84cc16', '#ef4444',
]

/**
 * Pick the accent color for the member at `index`.
 * @param index - zero-based member position inside the group.
 * @returns a CSS color string.
 */
export function assignColor(index: number): string {
  return MEMBER_COLORS[index % MEMBER_COLORS.length]!
}

/**
 * Resolve unique mentioned members in source order.
 * @param text - raw user text that may contain @mentions.
 * @param members - candidates to match against (the active group's members).
 * @returns mentioned members without duplicates.
 */
export function resolveMentions(text: string, members: readonly GroupMember[]): readonly GroupMember[] {
  const mentioned: GroupMember[] = []
  // Member names are often model ids (dots, slashes); the token class must cover them.
  for (const match of text.matchAll(/@([\w\u4e00-\u9fa5./-]+)/g)) {
    const token = match[1]!.toLowerCase()
    const member = members.find(item => item.id === token || item.name.toLowerCase() === token)
    if (member === undefined) continue
    if (!mentioned.some(item => item.id === member.id)) mentioned.push(member)
  }
  return mentioned
}

/**
 * Strip mention markup from user text, leaving the task content.
 * @param text - raw user text containing @mentions.
 * @returns the remaining task text.
 */
export function stripMentions(text: string): string {
  return text.replace(/@[\w\u4e00-\u9fa5./-]+/g, '').replace(/\s+/g, ' ').trim()
}
