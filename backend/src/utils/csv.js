// CSV 相关工具：分隔符探测与流式采样
const fs = require('fs')
const { parse } = require('csv-parse')

function detectDelimiter(firstLine) {
  const commaCount = (firstLine.match(/,/g) || []).length
  const semiCount = (firstLine.match(/;/g) || []).length
  return semiCount > commaCount ? ';' : ','
}

async function sampleCSV(filePath, delimiter, sampleSize = 1000) {
  const sampleRecords = []
  let headers = null
  await new Promise((resolve, reject) => {
    const input = fs.createReadStream(filePath)
    const p = parse({ columns: true, skip_empty_lines: true, trim: true, delimiter })
    p.on('readable', () => {
      let r
      while ((r = p.read()) && sampleRecords.length < sampleSize) {
        sampleRecords.push(r)
        if (!headers) headers = Object.keys(r)
      }
    })
    p.on('error', reject)
    p.on('end', resolve)
    input.pipe(p)
  })
  return { headers: headers || [], sampleRecords }
}

module.exports = { detectDelimiter, sampleCSV }

