// 上传相关控制器：即时解析与异步流式解析
const fs = require("fs");
const { parse } = require("csv-parse");
const { uploads, genId } = require("../store/uploads");
const { analyzeAndParse } = require("../services/uploadService");
const { parseTimeValue, isValidDate } = require("../utils/time");
const { detectDelimiter } = require("../utils/csv");
const path = require("path");
const { uploadDir } = require("../middleware/storage");

async function uploadImmediate(req, res) {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const buffer = fs.readFileSync(req.file.path);
  const sample = buffer.slice(0, Math.min(buffer.length, 4096)).toString("utf8");
  const firstLine = sample.split(/\r?\n/)[0] || "";
  const delimiter = detectDelimiter(firstLine);

  const records = [];
  let headers = null;
  const parser = parse(buffer, { columns: true, skip_empty_lines: true, trim: true, delimiter });
  parser.on("readable", () => {
    let r;
    while ((r = parser.read())) {
      records.push(r);
      if (!headers) headers = Object.keys(r);
    }
  });
  parser.on("error", (err) =>
    res.status(400).json({ error: "CSV parse error", detail: err.message }),
  );
  parser.on("end", () => {
    try {
      headers = headers || Object.keys(records[0] || {});
      const sampleSize = Math.min(records.length, 200);
      const candidates = headers.map((h) => {
        let ok = 0;
        for (let i = 0; i < sampleSize; i++) {
          const v = records[i]?.[h];
          if (v !== undefined && isValidDate(v)) ok++;
        }
        return { h, score: sampleSize ? ok / sampleSize : 0 };
      });
      const nameHints = headers.filter((h) => /time|timestamp|date|datetime|ts/i.test(String(h)));
      nameHints.forEach((h) => {
        const c = candidates.find((x) => x.h === h);
        if (c) c.score += 0.2;
      });
      candidates.sort((a, b) => b.score - a.score);
      let timeKey = candidates[0]?.score >= 0.5 ? candidates[0].h : null;
      if (!timeKey)
        return res.status(400).json({
          error: "No time-like column found",
          detail: "请确保至少一列为可解析的时间格式，例如 ISO 时间戳",
        });
      const seriesKeys = headers
        .filter((h) => h !== timeKey)
        .filter((h) => {
          let cnt = 0;
          for (let i = 0; i < sampleSize; i++) {
            const v = Number(records[i]?.[h]);
            if (Number.isFinite(v)) cnt++;
          }
          return sampleSize ? cnt / sampleSize >= 0.3 : true;
        });
      if (seriesKeys.length === 0)
        return res
          .status(400)
          .json({ error: "No numeric series columns", detail: "未检测到数值型列，请检查数据格式" });

      const data = [];
      for (const r of records) {
        const tv = parseTimeValue(r[timeKey]);
        if (!tv || isNaN(tv.getTime())) continue;
        const point = { time: tv.toISOString() };
        for (const k of seriesKeys) {
          const v = Number(r[k]);
          point[k] = Number.isFinite(v) ? v : null;
        }
        data.push(point);
      }
      const stats = {};
      for (const k of seriesKeys) {
        const values = data.map((d) => d[k]).filter((v) => typeof v === "number");
        const sum = values.reduce((a, b) => a + b, 0);
        const min = values.length ? Math.min(...values) : null;
        const max = values.length ? Math.max(...values) : null;
        const mean = values.length ? sum / values.length : null;
        stats[k] = { count: values.length, min, max, mean };
      }
      res.json({ columns: { time: timeKey, series: seriesKeys }, data, stats });
    } catch (e) {
      res.status(500).json({ error: "Processing error", detail: e.message });
    } finally {
      fs.promises.unlink(req.file.path).catch(() => {});
    }
  });
  parser.write(buffer);
  parser.end();
}

async function uploadStream(req, res) {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const id = genId();
  uploads.set(id, {
    id,
    name: req.file.originalname,
    size: req.file.size,
    status: "processing",
    percent: 0,
    result: null,
    createdAt: Date.now(),
  });
  res.json({ jobId: id });
  const filePath = req.file.path;
  try {
    const stat = await fs.promises.stat(filePath);
    let readBytes = 0;
    const result = await analyzeAndParse(filePath, (inc) => {
      readBytes += inc;
      const p = Math.min(99, Math.floor((readBytes / stat.size) * 100));
      const j = uploads.get(id);
      if (j) uploads.set(id, { ...j, percent: p });
    });
    if (result && result.error) {
      uploads.set(id, { ...uploads.get(id), status: "failed", percent: 100 });
    } else {
      uploads.set(id, { ...uploads.get(id), status: "done", percent: 100, result });
    }
  } catch (e) {
    uploads.set(id, { ...uploads.get(id), status: "failed", percent: 100 });
  } finally {
    fs.promises.unlink(filePath).catch(() => {});
  }
}

async function chunkInit(req, res) {
  try {
    const { name, size, chunkSize } = req.body || {};
    if (!name || !size) return res.status(400).json({ error: "Missing name/size" });
    const id = genId();
    const dir = path.join(uploadDir, id);
    await fs.promises.mkdir(dir, { recursive: true });
    const total = Math.ceil(Number(size) / Number(chunkSize || 5 * 1024 * 1024));
    uploads.set(id, {
      id,
      name,
      size: Number(size),
      status: "uploading",
      percent: 0,
      receivedBytes: 0,
      totalChunks: total,
      receivedChunks: 0,
      result: null,
      createdAt: Date.now(),
    });
    res.json({ uploadId: id });
  } catch (e) {
    res.status(500).json({ error: "Init failed" });
  }
}

async function chunkUpload(req, res) {
  try {
    const { uploadId, index } = req.body || {};
    if (!uploadId || typeof index === "undefined")
      return res.status(400).json({ error: "Missing uploadId/index" });
    const j = uploads.get(uploadId);
    if (!j) return res.status(404).json({ error: "Upload not found" });
    const dir = path.join(uploadDir, uploadId);
    await fs.promises.mkdir(dir, { recursive: true });
    const tempPath = req.file?.path;
    if (!tempPath) return res.status(400).json({ error: "No chunk uploaded" });
    const target = path.join(dir, `${index}.part`);
    await fs.promises.rename(tempPath, target);
    const stat = await fs.promises.stat(target);
    const receivedBytes = (j.receivedBytes || 0) + stat.size;
    const receivedChunks = (j.receivedChunks || 0) + 1;
    const percent = Math.min(95, Math.floor((receivedBytes / j.size) * 100));
    uploads.set(uploadId, { ...j, receivedBytes, receivedChunks, percent });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Chunk upload failed" });
  }
}

async function chunkComplete(req, res) {
  const { uploadId, total } = req.body || {};
  if (!uploadId) return res.status(400).json({ error: "Missing uploadId" });
  const j = uploads.get(uploadId);
  if (!j) return res.status(404).json({ error: "Upload not found" });
  const dir = path.join(uploadDir, uploadId);
  try {
    const count = Number(total || j.totalChunks || 0);
    const files = await fs.promises.readdir(dir);
    const present = new Set(
      files.filter((f) => /\.part$/.test(f)).map((f) => Number(f.replace(/\.part$/, ""))),
    );
    if (present.size !== count) {
      uploads.set(uploadId, { ...j, status: "failed", percent: 100 });
      return res.json({ ok: false, error: "missing_chunks" });
    }
    uploads.set(uploadId, { ...j, status: "merging", percent: Math.max(j.percent || 0, 96) });
    res.json({ ok: true });
    const mergedPath = path.join(uploadDir, `${uploadId}.merged`);
    const ws = fs.createWriteStream(mergedPath);
    let totalBytes = 0;
    for (let i = 0; i < count; i++) {
      const stat = await fs.promises.stat(path.join(dir, `${i}.part`));
      totalBytes += stat.size;
    }
    let written = 0;
    for (let i = 0; i < count; i++) {
      const part = path.join(dir, `${i}.part`);
      const rs = fs.createReadStream(part);
      await new Promise((resolve, reject) => {
        rs.on("error", reject);
        rs.on("data", (buf) => {
          written += buf.length;
          const cur = uploads.get(uploadId);
          const p = Math.min(98, Math.floor(96 + (written / totalBytes) * 2));
          if (cur) uploads.set(uploadId, { ...cur, percent: p });
        });
        rs.on("end", resolve);
        rs.pipe(ws, { end: false });
      });
    }
    await new Promise((r) => ws.end(r));
    const next = uploads.get(uploadId);
    uploads.set(uploadId, {
      ...next,
      status: "processing",
      percent: Math.max(next.percent || 0, 98),
    });
    try {
      const stat = await fs.promises.stat(mergedPath);
      let readBytes = 0;
      let lastTick = Date.now();
      const watchdog = setInterval(() => {
        const cur = uploads.get(uploadId);
        if (!cur || cur.status === 'done' || cur.status === 'failed') { clearInterval(watchdog); return; }
        if (Date.now() - lastTick > 60000) {
          uploads.set(uploadId, { ...cur, status: 'failed', percent: 100 });
          clearInterval(watchdog);
        }
      }, 10000);
      const result = await analyzeAndParse(mergedPath, (inc) => {
        readBytes += inc;
        const p = Math.min(100, Math.floor(98 + (readBytes / stat.size) * 2));
        const cur = uploads.get(uploadId);
        if (cur) uploads.set(uploadId, { ...cur, percent: p });
        lastTick = Date.now();
      });
      clearInterval(watchdog);
      const cur = uploads.get(uploadId);
      if (result && result.error) {
        uploads.set(uploadId, { ...cur, status: "failed", percent: 100 });
      } else {
        uploads.set(uploadId, { ...cur, status: "done", percent: 100, result });
      }
    } catch (e) {
      const cur = uploads.get(uploadId);
      uploads.set(uploadId, { ...cur, status: "failed", percent: 100 });
    } finally {
      try {
        const files = await fs.promises.readdir(dir);
        await Promise.all(files.map((f) => fs.promises.unlink(path.join(dir, f)).catch(() => {})));
        await fs.promises.rmdir(dir).catch(() => {});
        await fs.promises.unlink(mergedPath).catch(() => {});
      } catch {}
    }
  } catch (e) {
    const cur = uploads.get(uploadId);
    if (cur) uploads.set(uploadId, { ...cur, status: "failed", percent: 100 });
  }
}

function uploadProgress(req, res) {
  const j = uploads.get(req.params.id);
  if (!j) return res.status(404).json({ error: "Not found" });
  res.json({ status: j.status, percent: j.percent, name: j.name, size: j.size });
}

function uploadResult(req, res) {
  const j = uploads.get(req.params.id);
  if (!j) return res.status(404).json({ error: "Not found" });
  if (j.status !== "done") return res.status(202).json({ status: j.status, percent: j.percent });
  res.json(j.result);
}

function uploadList(req, res) {
  const list = Array.from(uploads.values()).map((j) => ({
    id: j.id,
    name: j.name,
    size: j.size,
    status: j.status,
    percent: j.percent,
  }));
  res.json(list);
}

function uploadProgressSSE(req, res) {
  const id = req.params.id;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();
  const send = () => {
    const j = uploads.get(id);
    if (!j) return;
    res.write(`data: ${JSON.stringify({ status: j.status, percent: j.percent })}\n\n`);
    if (j.status === "done" || j.status === "failed") {
      clearInterval(timer);
      res.end();
    }
  };
  const timer = setInterval(send, 500);
  send();
}

module.exports = {
  uploadImmediate,
  uploadStream,
  uploadProgress,
  uploadProgressSSE,
  uploadResult,
  uploadList,
  chunkInit,
  chunkUpload,
  chunkComplete,
};
