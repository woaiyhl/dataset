// CSV 相关工具：分隔符探测与流式采样
const fs = require("fs");
const { parse } = require("csv-parse");

function sanitizeHeaders(headers) {
  const used = new Map();
  return headers.map((h, i) => {
    const base = String(h || "").trim() || `__blank__${i}`;
    const key = used.has(base) ? `${base}_${used.get(base) + 1}` : base;
    used.set(base, (used.get(base) || 0) + 1);
    return key;
  });
}

function detectDelimiter(firstLine) {
  const candidates = [",", ";", "\t", "|"].map((d) => (d === "\t" ? "\t" : d));
  const counts = candidates.map((d) => ({
    d: d === "\t" ? "\t" : d,
    c: firstLine.split(d === "\t" ? "\t" : d).length - 1,
  }));
  counts.sort((a, b) => b.c - a.c);
  const top = counts[0];
  if (!top || top.c === 0) return ",";
  return top.d;
}

async function sampleCSV(filePath, delimiter, sampleSize = 1000) {
  const sampleRecords = [];
  let headers = null;
  await new Promise((resolve, reject) => {
    const input = fs.createReadStream(filePath);
    const p = parse({
      columns: sanitizeHeaders,
      skip_empty_lines: true,
      trim: true,
      delimiter,
      relax_column_count: true,
    });
    p.on("readable", () => {
      let r;
      while ((r = p.read()) && sampleRecords.length < sampleSize) {
        Object.keys(r).forEach((k) => { if (k.startsWith("__blank__")) delete r[k]; });
        sampleRecords.push(r);
        if (!headers)
          headers = Object.keys(r).filter((h) => String(h || "").trim() !== "" && !String(h).startsWith("__blank__"));
      }
    });
    p.on("error", reject);
    p.on("end", resolve);
    input.pipe(p);
  });
  return { headers: headers || [], sampleRecords };
}

module.exports = { detectDelimiter, sampleCSV, sanitizeHeaders };
