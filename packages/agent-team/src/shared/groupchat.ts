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
 * Wire format of one mention token. The composer inserts the literal text
 * `@<label>` and drops a zero-width marker carrying the member id right after
 * it, so the user sees and edits the label while the host resolves the id.
 * Names are free text (spaces, dots, CJK, `·`), so matching on them is
 * unreliable; the id is the value, the label is only the display.
 */
const TOKEN_OPEN = '\u2063'
const TOKEN_CLOSE = '\u2064'

/** Fallback label when a member has no name; never empty so tokens stay greppable. */
export function memberLabel(member: GroupMember): string {
  return member.name.length > 0 ? member.name : member.model
}

/**
 * Build the composer/transport token for one member.
 * @param member - the member the token refers to.
 * @returns `@<label>` followed by the id-carrying marker pair.
 */
export function mentionToken(member: GroupMember): string {
  return `@${memberLabel(member)}${TOKEN_OPEN}${member.id}${TOKEN_CLOSE}`
}

/**
 * Remove markers from text and collapse whitespace, yielding what a user reads.
 * @param text - text that may carry mention markers.
 * @returns the human-readable projection.
 */
export function displayText(text: string): string {
  return text.replace(new RegExp(`${TOKEN_OPEN}[^${TOKEN_CLOSE}]*${TOKEN_CLOSE}`, 'g'), '').replace(/\s+/g, ' ').trim()
}

/**
 * Resolve unique mentioned members in source order: id-carrying markers first,
 * then a label fallback for text typed by hand (no marker present).
 * @param text - raw user text that may contain mention tokens or plain @labels.
 * @param members - candidates to match against (the active group's members).
 * @returns mentioned members without duplicates.
 */
export function resolveMentions(text: string, members: readonly GroupMember[]): readonly GroupMember[] {
  const mentioned: GroupMember[] = []
  const add = (member: GroupMember): void => {
    if (!mentioned.some(item => item.id === member.id)) mentioned.push(member)
  }
  // Markers are authoritative: they survive renames and never collide.
  for (const match of text.matchAll(new RegExp(`${TOKEN_OPEN}([^${TOKEN_CLOSE}]*)${TOKEN_CLOSE}`, 'g'))) {
    const member = members.find(item => item.id === match[1])
    if (member !== undefined) add(member)
  }
  // Fallback for hand-typed mentions: longest label first, so a name that is a
  // prefix of another cannot shadow the longer one.
  const ordered = [...members].sort((left, right) => memberLabel(right).length - memberLabel(left).length)
  for (const member of ordered) {
    if (text.includes(`@${memberLabel(member)}`)) add(member)
  }
  return mentioned
}

/**
 * Strip mention tokens and markers from user text, leaving the task content.
 * @param text - raw user text containing mentions.
 * @returns the remaining task text.
 */
export function stripMentions(text: string, members: readonly GroupMember[] = []): string {
  let clean = text.replace(new RegExp(`${TOKEN_OPEN}[^${TOKEN_CLOSE}]*${TOKEN_CLOSE}`, 'g'), '')
  const ordered = [...members].sort((left, right) => memberLabel(right).length - memberLabel(left).length)
  for (const member of ordered) clean = clean.split(`@${memberLabel(member)}`).join('')
  return clean.replace(/\s+/g, ' ').trim()
}
