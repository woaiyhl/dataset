const fs = require('fs')
const path = require('path')

const ROWS = Number(process.argv[2] || 500)
const spikeRate = Number(process.argv[3] || 0.1)
const ampScale = Number(process.argv[4] || 2.0)
const trendScale = Number(process.argv[5] || 1.5)
const outDir = path.join(__dirname, '..', 'samples')
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, `generated_${ROWS}_varied_amp${ampScale}_spike${Math.round(spikeRate*100)}_trend${trendScale}.csv`)

const headers = [
  'id','_id','localDateTime','t','dataTimeStamp','device_id','assetnumber',
  'MotorCurrent','SpeedOfAgitator','Reducer1stShaftTemp',
  'motorDrBearingTemp','motorNdrBearingTemp','motorWindingTemp1','motorWindingTemp2','motorWindingTemp3',
  'OperationIndication'
]

function rnd(n=1){ return (Math.random()*2-1)*n }

const start = new Date('2023-08-09T23:59:00Z')
let lines = []
lines.push(headers.join(','))

// 生成更有起伏的序列：叠加正弦、缓慢趋势、偶发尖峰
for (let i = 0; i < ROWS; i++) {
  const id = i
  const _id = (Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0,24)
  const t0 = new Date(start.getTime() + i * 1000)
  const localDateTime = new Date(t0.getTime() + 49 * 1000).toISOString().replace('T', ' ').slice(0, 23)
  const t = t0.toISOString().replace('T',' ').slice(0,19)
  const dataTimeStamp = t
  const device_id = 'PR31101A'
  const assetnumber = 'PR31101A'

  const trend = (i/ROWS) * trendScale
  const peak = (Math.random() < spikeRate) ? (Math.random()*1.5+0.5) : 0

  const MotorCurrent = (Math.sin(i/10) * 0.2*ampScale + rnd(0.05*ampScale) + peak*0.3).toFixed(9)
  const SpeedOfAgitator = (0.6*Math.cos(i/14) * ampScale + 0.35*Math.sin(i/30) * ampScale + rnd(0.08*ampScale) + peak*0.2).toFixed(9)

  const Reducer1stShaftTemp = (34 + (2.5*ampScale)*Math.sin(i/20) + (0.9*ampScale)*Math.cos(i/50) + trend*0.9 + rnd(0.5*ampScale) + peak*1.6).toFixed(6)
  const motorDrBearingTemp = (58.9 + (1.8*ampScale)*Math.sin(i/22) + trend*0.7 + rnd(0.4*ampScale) + peak*1.2).toFixed(6)
  const motorNdrBearingTemp = (58.4 + (1.7*ampScale)*Math.cos(i/18) + trend*0.6 + rnd(0.4*ampScale) + peak*1.0).toFixed(6)
  const motorWindingTemp1 = (62.4 + (2.2*ampScale)*Math.sin(i/16) + rnd(0.5*ampScale) + peak*1.1).toFixed(6)
  const motorWindingTemp2 = (62.2 + (2.0*ampScale)*Math.cos(i/20) + rnd(0.5*ampScale) + peak*1.0).toFixed(6)
  const motorWindingTemp3 = (62.0 + (1.9*ampScale)*Math.sin(i/14) + rnd(0.5*ampScale) + peak*0.9).toFixed(6)

  const OperationIndication = (Math.random() < 0.1 ? 1 : 0).toFixed(1)

  const row = [id,_id,localDateTime,t,dataTimeStamp,device_id,assetnumber,
    MotorCurrent,SpeedOfAgitator,Reducer1stShaftTemp,
    motorDrBearingTemp,motorNdrBearingTemp,motorWindingTemp1,motorWindingTemp2,motorWindingTemp3,
    OperationIndication
  ]
  lines.push(row.join(','))
}

fs.writeFileSync(outPath, lines.join('\n'))
console.log('Generated:', outPath)
