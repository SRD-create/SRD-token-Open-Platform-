import anthropic from './anthropic.svg'
import bedrock from './bedrock.svg'
import defaultProvider from './default-provider.svg'
import doubao from './doubao.svg'
import gemini from './gemini.svg'
import hunyuan from './hunyuan.svg'
import minimax from './minimax.svg'
import moonshot from './moonshot.svg'
import openai from './openai.svg'
import qwen from './qwen.svg'
import wenxin from './wenxin.svg'
import zhipu from './zhipu.svg'

/**
 * 与模型广场 `vendorId` 对齐；Claude → anthropic，AWS → bedrock。
 * 未收录的 id 回退到 default-provider。
 */
const MAP: Record<string, string> = {
  all: defaultProvider,
  openai,
  claude: anthropic,
  /** 与模型服务接口 `provider` 取值对齐 */
  anthropic,
  gemini,
  /** 部分后端用 google 表示 Gemini */
  google: gemini,
  wenxin,
  qwen,
  tongyi: qwen,
  hunyuan,
  minimax,
  zhipu,
  moonshot,
  doubao,
  aws: bedrock,
  bedrock,
  mcp: defaultProvider,
  grpc: defaultProvider,
  rest: defaultProvider,
}

export function vendorIconSrc(vendorId: string): string {
  return MAP[vendorId] ?? defaultProvider
}
