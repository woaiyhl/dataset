// 上传解析服务：采样判定、流式解析、进度更新与结果汇总
const fs = require('fs')
const { parse } = require('csv-parse')
const { detectDelimiter, sampleCSV } = require('../utils/csv')
const { parseTimeValue, isValidDate } = require('../utils/time')

async function analyzeAndParse(filePath, onProgress) {
  const fh = await fs.promises.open(filePath, 'r')
  const buf = Buffer.alloc(4096)
  await fh.read(buf, 0, 4096, 0)
  await fh.close()
  const sampleText = buf.toString('utf8')
  const firstLine = sampleText.split(/\r?\n/)[0] || ''
  const delimiter = detectDelimiter(firstLine)

  const { headers, sampleRecords } = await sampleCSV(filePath, delimiter, 1000)

  const ss = sampleRecords.length
  const candidates = headers.map((h) => {
    let ok = 0
    for (let i = 0; i < ss; i++) {
      const v = sampleRecords[i]?.[h]
      if (v !== undefined && isValidDate(v)) ok++
    }
    return { h, score: ss ? ok / ss : 0 }
  })
  const nameHints = headers.filter((h) => /time|timestamp|date|datetime|ts/i.test(String(h)))
  nameHints.forEach((h) => {
    const c = candidates.find((x) => x.h === h)
    if (c) c.score += 0.2
  })
  candidates.sort((a, b) => b.score - a.score)
  let timeKey = candidates[0]?.score >= 0.5 ? candidates[0].h : null

  let yKey = null, mKey = null, dKey = null, hKey = null, iKey = null, sKey = null
  if (!timeKey) {
    const lower = headers.map((h) => String(h).toLowerCase())
    const findKey = (keys) => headers[lower.findIndex((h) => keys.some((k) => h === k || h.includes(k)))] || null
    yKey = findKey(['year', 'yr', 'yyyy'])
    mKey = findKey(['month', 'mon', 'mm'])
    dKey = findKey(['day', 'dd', 'date'])
    hKey = findKey(['hour', 'hr', 'hh'])
    iKey = findKey(['minute', 'min', 'mi'])
    sKey = findKey(['second', 'sec', 'ss'])
    if (yKey && mKey && dKey) timeKey = '__composite__'
  }
  if (!timeKey) return { error: 'No time-like column found' }

  const seriesKeys = headers.filter((h) => h !== timeKey).filter((h) => {
    let cnt = 0
    for (let i = 0; i < ss; i++) {
      const v = Number(sampleRecords[i]?.[h])
      if (Number.isFinite(v)) cnt++
    }
    return ss ? cnt / ss >= 0.3 : true
  })
  if (seriesKeys.length === 0) return { error: 'No numeric series columns' }

  const MAX_POINTS = 200000
  const data = []
  const acc = {}
  seriesKeys.forEach((k) => { acc[k] = { count: 0, sum: 0, min: Infinity, max: -Infinity } })
  let idx = 0
  let step = 1

  await new Promise((resolve, reject) => {
    const input = fs.createReadStream(filePath)
    const p = parse({ columns: true, skip_empty_lines: true, trim: true, delimiter })
    input.on('data', (chunk) => { onProgress && onProgress(chunk.length) })
    p.on('readable', () => {
      let r
      while ((r = p.read())) {
        idx++
        let tv = null
        if (timeKey === '__composite__') {
          const Y = Number(r[yKey])
          const M = Number(r[mKey])
          const D = Number(r[dKey])
          const H = hKey ? Number(r[hKey]) : 0
          const I = iKey ? Number(r[iKey]) : 0
          const S = sKey ? Number(r[sKey]) : 0
          const dt = new Date(Y, M - 1, D, H || 0, I || 0, S || 0)
          tv = isNaN(dt.getTime()) ? null : dt
        } else {
          tv = parseTimeValue(r[timeKey])
        }
        if (!tv || isNaN(tv.getTime())) continue
        const point = { time: tv.toISOString() }
        for (const k of seriesKeys) {
          const v = Number(r[k])
          if (Number.isFinite(v)) {
            acc[k].count++
            acc[k].sum += v
            if (v < acc[k].min) acc[k].min = v
            if (v > acc[k].max) acc[k].max = v
            point[k] = v
          } else {
            point[k] = null
          }
        }
        if (idx % step === 0) data.push(point)
        if (idx > MAX_POINTS && step === 1) step = Math.ceil(idx / MAX_POINTS)
      }
    })
    p.on('error', reject)
    p.on('end', resolve)
    input.pipe(p)
  })

  const stats = {}
  for (const k of seriesKeys) {
    const c = acc[k].count
    const sum = acc[k].sum
    const min = c ? acc[k].min : null
    const max = c ? acc[k].max : null
    const mean = c ? sum / c : null
    stats[k] = { count: c, min, max, mean }
  }

  return { columns: { time: timeKey, series: seriesKeys }, data, stats }
}

module.exports = { analyzeAndParse }

