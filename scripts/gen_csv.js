const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "..", "samples");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "generated_1000.csv");

const headers = [
  "id",
  "_id",
  "localDateTime",
  "t",
  "dataTimeStamp",
  "device_id",
  "assetnumber",
  "MotorCurrent",
  "SpeedOfAgitator",
  "Reducer1stShaftTemp",
  "motorDrBearingTemp",
  "motorNdrBearingTemp",
  "motorWindingTemp1",
  "motorWindingTemp2",
  "motorWindingTemp3",
  "OperationIndication",
];

const start = new Date("2023-08-09T23:59:00Z");
let lines = [];
lines.push(headers.join(","));
for (let i = 0; i < 1000; i++) {
  const id = i;
  const _id = (Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 24);
  const localDateTime = new Date(start.getTime() + (i + 49) * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 23);
  const t = new Date(start.getTime() + i * 1000).toISOString().replace("T", " ").slice(0, 19);
  const dataTimeStamp = t;
  const device_id = "PR31101A";
  const assetnumber = "PR31101A";
  const MotorCurrent = (Math.sin(i / 20) * 0.01).toFixed(9);
  const SpeedOfAgitator = (Math.cos(i / 15) * 0.12).toFixed(9);
  const Reducer1stShaftTemp = (34 + Math.random()).toFixed(6);
  const motorDrBearingTemp = (59 + Math.random()).toFixed(6);
  const motorNdrBearingTemp = (58 + Math.random()).toFixed(6);
  const motorWindingTemp1 = (62 + Math.random()).toFixed(6);
  const motorWindingTemp2 = (62 + Math.random()).toFixed(6);
  const motorWindingTemp3 = (62 + Math.random()).toFixed(6);
  const OperationIndication = (Math.random() < 0.95 ? 0 : 1).toFixed(1);
  const row = [
    id,
    _id,
    localDateTime,
    t,
    dataTimeStamp,
    device_id,
    assetnumber,
    MotorCurrent,
    SpeedOfAgitator,
    Reducer1stShaftTemp,
    motorDrBearingTemp,
    motorNdrBearingTemp,
    motorWindingTemp1,
    motorWindingTemp2,
    motorWindingTemp3,
    OperationIndication,
  ];
  lines.push(row.join(","));
}

fs.writeFileSync(outPath, lines.join("\n"));
console.log("Generated:", outPath);
