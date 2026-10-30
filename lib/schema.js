import Schema from '@deepseek-ai/schemastery'

function volatile(schema) {
  return typeof schema.volatile === 'function' ? schema.volatile() : schema
}

function secret(schema) {
  if (typeof schema.role === 'function') return schema.role('secret')
  return schema
}

export const Config = Schema.object({
  maxBytes: volatile(Schema.number().default(524288).description('跟踪文本的最大字节数')),
  ignore: volatile(Schema.array(String).default([]).description('额外忽略的路径片段或 *.ext')),
  enableSelftest: volatile(
    Schema.boolean().default(true).description('开发自测工具：按 diff 推理代码自测 / 边缘测试 / 探索性测试'),
  ),
  exploreBaseUrl: volatile(
    Schema.string().default('').description('探索性测试的网站根地址，例如 http://127.0.0.1:3000'),
  ),
  exploreToken: volatile(
    secret(Schema.string().default('').description('探索性测试用的 token，只保存在设置里，不要发给模型')),
  ),
  exploreTimeoutMs: volatile(Schema.number().default(8000).description('探索性请求超时（毫秒）')),
})
