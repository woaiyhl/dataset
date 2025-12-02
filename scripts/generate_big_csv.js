const fs = require('fs')
const path = require('path')

const outPath = path.join(__dirname, '..', 'samples', 'huge_timeseries.csv')
const start = new Date('2023-01-01T00:00:00Z').getTime()
const stepMs = 60 * 1000
const rows = 100000

const header = 'timestamp,valA,valB,valC\n'
const stream = fs.createWriteStream(outPath)
stream.write(header)
for (let i = 0; i < rows; i++) {
  const t = new Date(start + i * stepMs).toISOString()
  const a = (Math.sin(i / 180) * 20 + 50).toFixed(2)
  const b = (Math.cos(i / 200) * 10 + 30).toFixed(2)
  const c = (i % 100) + 100
  stream.write(`${t},${a},${b},${c}\n`)
}
stream.end(() => {
  console.log('Generated:', outPath)
})

