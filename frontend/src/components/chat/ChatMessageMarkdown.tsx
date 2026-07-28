import 'highlight.js/styles/github-dark.min.css'

import type { Element, Root } from 'hast'
import { common } from 'lowlight'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'

const COMMON_LANGS = new Set(Object.keys(common))

/** 模型常用写法 → lowlight / common 里的正式语言名 */
const LANG_SYNONYM: Record<string, string> = {
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hxx: 'cpp',
  cplusplus: 'cpp',
  'c#': 'csharp',
  'c-sharp': 'csharp',
  cs: 'csharp',
  py: 'python',
  python3: 'python',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  node: 'javascript',
  nodejs: 'javascript',
  ts: 'typescript',
  rb: 'ruby',
  rs: 'rust',
  sh: 'bash',
  zsh: 'bash',
  shell: 'bash',
  yml: 'yaml',
  golang: 'go',
  /** 中文围栏标签 */
  c语言: 'c',
  cpp语言: 'cpp',
  python语言: 'python',
  /** 终端/示例，避免误走 detect */
  text: 'plaintext',
  txt: 'plaintext',
  output: 'plaintext',
  console: 'plaintext',
  log: 'plaintext',
  logs: 'plaintext',
}

function resolveFenceLanguage(raw: string): string | 'strip' {
  const t = raw.trim()
  if (!t) return 'strip'

  const lower = t.toLowerCase()
  if (COMMON_LANGS.has(lower)) return lower

  const mapped = LANG_SYNONYM[lower]
  if (mapped && COMMON_LANGS.has(mapped)) return mapped

  if (/c\+\+/i.test(t)) return 'cpp'
  if (/c语言/i.test(t) && !/c\+\+/i.test(t)) return 'c'
  if (/python语言|py语言/i.test(t)) return 'python'

  return 'strip'
}

/**
 * 在 rehype-highlight 之前处理围栏 info 字符串：
 * - 统一小写、别名、中文标签
 * - 无法识别的语言去掉 class，交给 detect 自动识别（避免 Unknown language 整段不着色）
 */
function rehypeNormalizeFenceLang() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'code') return
      const list = node.properties.className
      if (!Array.isArray(list) || list.length === 0) return

      let raw = ''
      let langIdx = -1

      for (let i = 0; i < list.length; i++) {
        const v = String(list[i])
        if (v.startsWith('language-')) {
          raw = v.slice(9)
          langIdx = i
          break
        }
        if (v.startsWith('lang-')) {
          raw = v.slice(5)
          langIdx = i
          break
        }
      }
      if (langIdx < 0) return

      const resolved = resolveFenceLanguage(raw)
      if (resolved === 'strip') {
        node.properties.className = list.filter((c) => {
          const s = String(c)
          return !s.startsWith('language-') && !s.startsWith('lang-')
        })
        return
      }

      const next = list.filter((c) => {
        const s = String(c)
        return !s.startsWith('language-') && !s.startsWith('lang-')
      })
      next.push(`language-${resolved}`)
      node.properties.className = next
    })
  }
}

const highlightAliases: Record<string, string | ReadonlyArray<string>> = {
  c: ['C'],
  cpp: ['C++', 'c++', 'Cpp', 'CPP', 'cplusplus', 'H++'],
  csharp: ['C#', 'c#', 'CS'],
  javascript: ['JavaScript', 'JS', 'node', 'nodejs'],
  typescript: ['TypeScript', 'TS'],
  python: ['Python', 'PY', 'py2', 'py3'],
  bash: ['Bash', 'SH', 'Zsh'],
  yaml: ['YAML', 'YML'],
  rust: ['Rust'],
  go: ['Go', 'Golang'],
  java: ['Java'],
  kotlin: ['Kotlin', 'KT'],
  swift: ['Swift'],
  sql: ['SQL'],
  json: ['JSON'],
  xml: ['HTML', 'SVG', 'htm'],
  markdown: ['Markdown', 'MD', 'mdx', 'MDX'],
  css: ['CSS'],
  diff: ['patch', 'PATCH', 'Patch'],
  plaintext: ['Text', 'TXT', 'output', 'Output', 'console', 'Console'],
  objectivec: ['objc', 'Objective-C', 'objective-c', 'ObjC'],
}

const mdWrapper =
  'chat-message-markdown min-w-0 break-words text-inherit [&_a]:break-all [&_a]:text-sky-400 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-sky-300 ' +
  '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-500 [&_blockquote]:pl-3 [&_blockquote]:text-zinc-400 ' +
  '[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:first:mt-0 ' +
  '[&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:first:mt-0 ' +
  '[&_h3]:mb-1.5 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:first:mt-0 ' +
  '[&_hr]:my-4 [&_hr]:border-white/10 ' +
  '[&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 ' +
  '[&_p]:mb-2 [&_p]:last:mb-0 ' +
  '[&_pre]:my-3 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:ring-1 [&_pre]:ring-white/10 ' +
  '[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-sm ' +
  '[&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-white/10 [&_th]:px-2 [&_th]:py-1 ' +
  '[&_p>code]:rounded-md [&_p>code]:bg-black/35 [&_p>code]:px-1.5 [&_p>code]:py-px [&_p>code]:text-[0.875em] ' +
  '[&_li>code]:rounded-md [&_li>code]:bg-black/35 [&_li>code]:px-1.5 [&_li>code]:py-px [&_li>code]:text-[0.875em] ' +
  '[&_td>code]:rounded-md [&_td>code]:bg-black/35 [&_td>code]:px-1.5 [&_td>code]:py-px [&_td>code]:text-[0.875em] ' +
  '[&_th>code]:rounded-md [&_th>code]:bg-black/35 [&_th>code]:px-1.5 [&_th>code]:py-px [&_th>code]:text-[0.875em] ' +
  '[&_h1>code]:rounded-md [&_h1>code]:bg-black/35 [&_h1>code]:px-1.5 [&_h1>code]:py-px [&_h1>code]:text-[0.875em] ' +
  '[&_h2>code]:rounded-md [&_h2>code]:bg-black/35 [&_h2>code]:px-1.5 [&_h2>code]:py-px [&_h2>code]:text-[0.875em] ' +
  '[&_h3>code]:rounded-md [&_h3>code]:bg-black/35 [&_h3>code]:px-1.5 [&_h3>code]:py-px [&_h3>code]:text-[0.875em]'

type Props = {
  content: string
  className?: string
}

export function ChatMessageMarkdown({ content, className }: Props) {
  return (
    <div className={[mdWrapper, className].filter(Boolean).join(' ')}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeNormalizeFenceLang,
          [rehypeHighlight, { detect: true, aliases: highlightAliases }],
        ]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
