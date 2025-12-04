// 时间解析工具
// 目标：尽可能兼容常见的时间格式，并避免把单独的年份、月份误判为完整时间。

function parseTimeValue(v) {
  if (v === undefined || v === null) return null
  if (typeof v === 'number') {
    if (v > 1e12) return new Date(v)
    if (v > 1e9) return new Date(v * 1000)
    return null
  }
  const s = String(v).trim()
  if (!s) return null
  if (/^\d{13}$/.test(s)) return new Date(Number(s))
  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000)
  let m = s.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})$/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  m = s.match(/^(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0))
  if (/[T ]\d{2}:\d{2}/.test(s) || /\d{4}-\d{2}-\d{2}/.test(s) || /\d{4}\/\d{2}\/\d{2}/.test(s)) {
    const iso = new Date(s)
    if (!isNaN(iso.getTime())) return iso
  }
  return null
}

function isValidDate(v) {
  const t = parseTimeValue(v)
  return t && !isNaN(t.getTime())
}

module.exports = { parseTimeValue, isValidDate }

