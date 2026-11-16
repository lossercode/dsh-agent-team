/** Copy owned by the group chat feature. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    sidebarGroupChat: keyof typeof zh
  }
}

/** Simplified Chinese group chat copy. */
export const zh = {
  title: '群聊',
  description: '与多个 AI 模型成员的群聊面板',
  placeholder: '输入消息，@ 可提及成员…',
  send: '发送',
  typing: '正在输入…',
  expand: '展开完整回答',
  collapse: '收起',
  hint: '@ 某个成员后回车，被 @ 的成员将独立开 Session 思考',
  offline: '群聊后端未就绪：请确认已在终端启动 dsh web 宿主',
  'markdown.copy': '复制',
  'markdown.copied': '复制成功',
  'markdown.codeBlock.title': '代码块',
  'markdown.codeBlock.wrap': '自动换行',
  'markdown.codeBlock.unwrap': '取消自动换行',
  'markdown.footnotes': '脚注',
} satisfies Record<string, string>

/** English group chat copy. */
export const en = {
  title: 'Group Chat',
  description: 'Chat with multiple AI model members',
  placeholder: 'Type a message, @ to mention members…',
  send: 'Send',
  typing: 'typing…',
  expand: 'Show full answer',
  collapse: 'Collapse',
  hint: 'Press Enter after @mentioning a member; each mention runs in its own session',
  offline: 'Group chat backend not ready: make sure the dsh web host is running',
  'markdown.copy': 'Copy',
  'markdown.copied': 'Copied',
  'markdown.codeBlock.title': 'Code block',
  'markdown.codeBlock.wrap': 'Wrap lines',
  'markdown.codeBlock.unwrap': 'Unwrap lines',
  'markdown.footnotes': 'Footnotes',
} satisfies Record<string, string>
