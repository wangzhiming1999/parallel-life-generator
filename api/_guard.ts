// 服务端敏感词过滤：同步短词库 + 简单归一化匹配（毫秒级，不影响流式首字延迟）
// 命中即拒绝生成；输出侧由中转函数在流式结束后做二次扫描（发现即截断提示）

const SENSITIVE_WORDS: string[] = [
  // 政治类
  '习近平', '毛泽东', '六四', '天安门', '法轮功', '达赖', '台独', '港独', '疆独',
  '共产党', '国民党', '政府倒台', '颠覆国家', '游行示威',
  // 暴力/自伤类
  '自杀', '自残', '割腕', '上吊', '跳楼', '安眠药自杀', '杀人', '谋杀', '炸药', '爆炸袭击',
  '怎么杀人', '制造炸弹', '投毒',
  // 色情/违法类
  '嫖娼', '卖淫', '毒品', '吸毒', '制毒', '赌博网站', '洗钱', '诈骗教程',
]

// 归一化：去空白与常见干扰符
function normalize(text: string): string {
  return text.replace(/[\s·•*_.\-—~～!！?？,，。;；:：'’"“”()（）\[\]【】]/g, '')
}

export function containsSensitiveWord(text: string): boolean {
  const normalized = normalize(text)
  return SENSITIVE_WORDS.some((word) => normalized.includes(normalize(word)))
}

// 非空字段长度与类型服务端二次校验
export function validateGenerateBody(body: unknown):
  | { ok: true; value: { assumption: string; age: string; occupation: string; personality: string } }
  | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: '请求体格式错误' }
  }
  const b = body as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : '')

  const assumption = str(b.assumption).trim()
  const age = str(b.age).trim().slice(0, 3)
  const occupation = str(b.occupation).trim().slice(0, 20)
  const personality = str(b.personality).trim().slice(0, 20)

  if (assumption.length < 2 || assumption.length > 50) {
    return { ok: false, error: '假设语句需为 2-50 字' }
  }
  if (age && !/^\d{1,3}$/.test(age)) {
    return { ok: false, error: '年龄格式不正确' }
  }
  return { ok: true, value: { assumption, age, occupation, personality } }
}
