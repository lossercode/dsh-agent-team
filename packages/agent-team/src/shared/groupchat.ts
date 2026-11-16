/** Member roster and mention parsing shared by the host orchestrator and the web panel. */
import type { GroupMember } from '../types.ts'

export type * from '../types.ts'

/**
 * Fixed roster. Members without an explicit provider/model route run on the
 * Session default model; config can overlay routing per member id.
 */
export const roster: readonly GroupMember[] = [
  { id: 'router', name: '副群主', color: '#f5b642' },
  { id: 'deepseek', name: 'DeepSeek', color: '#4d6bfe' },
  { id: 'glm', name: 'GLM', color: '#14b8a6' },
  { id: 'gpt', name: 'GPT', color: '#10a37f' },
]

/** Look up a member by id. */
export function memberOf(id: string | undefined): GroupMember | undefined {
  return roster.find(member => member.id === id)
}

/**
 * Resolve unique mentioned members in source order; the deputy router is
 * dropped because orchestration is not wired yet.
 * @param text - raw user text that may contain @mentions.
 * @returns mentioned members without duplicates.
 */
export function resolveMentions(text: string): readonly GroupMember[] {
  const mentioned: GroupMember[] = []
  for (const match of text.matchAll(/@([\w\u4e00-\u9fa5-]+)/g)) {
    const token = match[1]!.toLowerCase()
    const member = roster.find(item => item.id === token || item.name.toLowerCase() === token)
    if (member === undefined || member.id === 'router') continue
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
  return text.replace(/@([\w\u4e00-\u9fa5-]+)/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Overlay member model routing from plugin config onto the default roster.
 * @param overrides - config-supplied provider/model pairs keyed by member id.
 * @returns the effective roster; unknown ids are ignored.
 */
export function withOverrides(overrides: Readonly<Record<string, { provider?: string | undefined, model?: string | undefined }>>): readonly GroupMember[] {
  return roster.map(member => {
    const override = overrides[member.id]
    if (override === undefined || member.id === 'router') return member
    return {
      ...member,
      ...(override.provider !== undefined ? { provider: override.provider } : {}),
      ...(override.model !== undefined ? { model: override.model } : {}),
    }
  })
}
