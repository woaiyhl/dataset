const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const multer = require("multer");
const { parse } = require("csv-parse");
const fs = require("fs");
const path = require("path");

const app = express();
const port = process.env.PORT || 3001;
const uploads = new Map();
const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const ok = /http:\/\/localhost:\d+/.test(origin) || /http:\/\/127\.0\.0\.1:\d+/.test(origin);
      callback(null, ok ? true : false);
    },
  }),
);
app.use(morgan("dev"));

const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 1024 * 1024 * 1024 } });

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const buffer = fs.readFileSync(req.file.path);
  const records = [];
  let headers = null;
  const sample = buffer.slice(0, Math.min(buffer.length, 4096)).toString("utf8");
  const firstLine = sample.split(/\r?\n/)[0] || "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const delimiter = semiCount > commaCount ? ";" : ",";

  const parser = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter,
  });

  parser.on("readable", () => {
    let record;
    while ((record = parser.read())) {
      records.push(record);
    }
  });

  parser.on("error", (err) => {
    res.status(400).json({ error: "CSV parse error", detail: err.message });
  });

  parser.on("end", () => {
    try {
      if (!headers) {
        headers = Object.keys(records[0] || {});
      }
      const parseTimeValue = (v) => {
        if (v === undefined || v === null) return null;
        if (typeof v === "number") {
          if (v > 1e12) return new Date(v);
          if (v > 1e9) return new Date(v * 1000);
          return null;
        }
        const s = String(v).trim();
        if (!s) return null;
        if (/^\d{13}$/.test(s)) return new Date(Number(s));
        if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000);
        let m = s.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})$/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        m = s.match(
          /^(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/,
        );
        if (m)
          return new Date(
            Number(m[1]),
            Number(m[2]) - 1,
            Number(m[3]),
            Number(m[4]),
            Number(m[5]),
            Number(m[6] || 0),
          );
        if (
          /[T ]\d{2}:\d{2}/.test(s) ||
          /\d{4}-\d{2}-\d{2}/.test(s) ||
          /\d{4}\/\d{2}\/\d{2}/.test(s)
        ) {
          const iso = new Date(s);
          if (!isNaN(iso.getTime())) return iso;
        }
        return null;
      };
      const isValidDate = (v) => {
        const t = parseTimeValue(v);
        return t && !isNaN(t.getTime());
      };
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
        if (c) c.score += 0.2; // bias towards obvious names
      });
      candidates.sort((a, b) => b.score - a.score);
      let timeKey = candidates[0]?.score >= 0.5 ? candidates[0].h : null;
      if (!timeKey) {
        const lower = headers.map((h) => String(h).toLowerCase());
        const findKey = (keys) =>
          headers[lower.findIndex((h) => keys.some((k) => h === k || h.includes(k)))] || null;
        const yKey = findKey(["year", "yr", "yyyy"]);
        const mKey = findKey(["month", "mon", "mm"]);
        const dKey = findKey(["day", "dd", "date"]);
        const hKey = findKey(["hour", "hr", "hh"]);
        const iKey = findKey(["minute", "min", "mi"]);
        const sKey = findKey(["second", "sec", "ss"]);
        if (yKey && mKey && dKey) {
          timeKey = "__composite__";
          const buildDate = (r) => {
            const Y = Number(r[yKey]);
            const M = Number(r[mKey]);
            const D = Number(r[dKey]);
            const H = hKey ? Number(r[hKey]) : 0;
            const I = iKey ? Number(r[iKey]) : 0;
            const S = sKey ? Number(r[sKey]) : 0;
            if (!Number.isFinite(Y) || !Number.isFinite(M) || !Number.isFinite(D)) return null;
            const dt = new Date(Y, M - 1, D, H || 0, I || 0, S || 0);
            return isNaN(dt.getTime()) ? null : dt;
          };
          const good = records
            .slice(0, sampleSize)
            .reduce((acc, r) => acc + (buildDate(r) ? 1 : 0), 0);
          if (!good) timeKey = null;
          else {
            // replace parse for composite
            records.forEach((r, idx) => {
              r.__composite__ = buildDate(r)?.toISOString() || null;
            });
          }
        }
      }
      if (!timeKey) {
        return res.status(400).json({
          error: "No time-like column found",
          detail: "请确保至少一列为可解析的时间格式，例如 ISO 时间戳",
        });
      }
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
      if (seriesKeys.length === 0) {
        return res
          .status(400)
          .json({ error: "No numeric series columns", detail: "未检测到数值型列，请检查数据格式" });
      }

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
      if (req.file && req.file.path) {
        fs.promises.unlink(req.file.path).catch(() => {});
      }
    } catch (e) {
      res.status(500).json({ error: "Processing error", detail: e.message });
    }
  });

  parser.write(buffer);
  parser.end();
});

app.post("/api/upload-stream", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
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
    const fh = await fs.promises.open(filePath, "r");
    const buf = Buffer.alloc(4096);
    await fh.read(buf, 0, 4096, 0);
    await fh.close();
    const sampleText = buf.toString("utf8");
    const firstLine = sampleText.split(/\r?\n/)[0] || "";
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    const delimiter = semiCount > commaCount ? ";" : ",";
    const sampleSize = 1000;
    const sampleRecords = [];
    let headers = null;
    await new Promise((resolve, reject) => {
      const input = fs.createReadStream(filePath);
      const p = parse({ columns: true, skip_empty_lines: true, trim: true, delimiter });
      p.on("readable", () => {
        let r;
        while ((r = p.read()) && sampleRecords.length < sampleSize) {
          sampleRecords.push(r);
          if (!headers) headers = Object.keys(r);
        }
      });
      p.on("error", reject);
      p.on("end", resolve);
      input.pipe(p);
    });
    const parseTimeValue = (v) => {
      if (v === undefined || v === null) return null;
      if (typeof v === "number") {
        if (v > 1e12) return new Date(v);
        if (v > 1e9) return new Date(v * 1000);
        return null;
      }
      const s = String(v).trim();
      if (!s) return null;
      if (/^\d{13}$/.test(s)) return new Date(Number(s));
      if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000);
      let m = s.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})$/);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      m = s.match(/^(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0));
      if (/[T ]\d{2}:\d{2}/.test(s) || /\d{4}-\d{2}-\d{2}/.test(s) || /\d{4}\/\d{2}\/\d{2}/.test(s)) {
        const iso = new Date(s);
        if (!isNaN(iso.getTime())) return iso;
      }
      return null;
    };
    const isValidDate = (v) => {
      const t = parseTimeValue(v);
      return t && !isNaN(t.getTime());
    };
    const ss = Math.min(sampleRecords.length, sampleSize);
    const candidates = (headers || []).map((h) => {
      let ok = 0;
      for (let i = 0; i < ss; i++) {
        const v = sampleRecords[i]?.[h];
        if (v !== undefined && isValidDate(v)) ok++;
      }
      return { h, score: ss ? ok / ss : 0 };
    });
    const nameHints = (headers || []).filter((h) => /time|timestamp|date|datetime|ts/i.test(String(h)));
    nameHints.forEach((h) => {
      const c = candidates.find((x) => x.h === h);
      if (c) c.score += 0.2;
    });
    candidates.sort((a, b) => b.score - a.score);
    let timeKey = candidates[0]?.score >= 0.5 ? candidates[0].h : null;
    let yKey = null,
      mKey = null,
      dKey = null,
      hKey = null,
      iKey = null,
      sKey = null;
    if (!timeKey) {
      const lower = (headers || []).map((h) => String(h).toLowerCase());
      const findKey = (keys) => (headers || [])[lower.findIndex((h) => keys.some((k) => h === k || h.includes(k)))] || null;
      yKey = findKey(["year", "yr", "yyyy"]);
      mKey = findKey(["month", "mon", "mm"]);
      dKey = findKey(["day", "dd", "date"]);
      hKey = findKey(["hour", "hr", "hh"]);
      iKey = findKey(["minute", "min", "mi"]);
      sKey = findKey(["second", "sec", "ss"]);
      if (yKey && mKey && dKey) timeKey = "__composite__";
    }
    if (!timeKey) {
      uploads.set(id, { ...uploads.get(id), status: "failed", percent: 100 });
      await fs.promises.unlink(filePath).catch(() => {});
      return;
    }
    const seriesKeys = (headers || []).filter((h) => h !== timeKey).filter((h) => {
      let cnt = 0;
      for (let i = 0; i < ss; i++) {
        const v = Number(sampleRecords[i]?.[h]);
        if (Number.isFinite(v)) cnt++;
      }
      return ss ? cnt / ss >= 0.3 : true;
    });
    if (seriesKeys.length === 0) {
      uploads.set(id, { ...uploads.get(id), status: "failed", percent: 100 });
      await fs.promises.unlink(filePath).catch(() => {});
      return;
    }
    const MAX_POINTS = 200000;
    const data = [];
    const acc = {};
    seriesKeys.forEach((k) => {
      acc[k] = { count: 0, sum: 0, min: Infinity, max: -Infinity };
    });
    let idx = 0;
    let step = 1;
    await new Promise((resolve, reject) => {
      let readBytes = 0;
      const input = fs.createReadStream(filePath);
      input.on("data", (chunk) => {
        readBytes += chunk.length;
        const p = Math.min(99, Math.floor((readBytes / stat.size) * 100));
        const j = uploads.get(id);
        if (j) uploads.set(id, { ...j, percent: p });
      });
      const p = parse({ columns: true, skip_empty_lines: true, trim: true, delimiter });
      p.on("readable", () => {
        let r;
        while ((r = p.read())) {
          idx++;
          let tv = null;
          if (timeKey === "__composite__") {
            const Y = Number(r[yKey]);
            const M = Number(r[mKey]);
            const D = Number(r[dKey]);
            const H = hKey ? Number(r[hKey]) : 0;
            const I = iKey ? Number(r[iKey]) : 0;
            const S = sKey ? Number(r[sKey]) : 0;
            const dt = new Date(Y, M - 1, D, H || 0, I || 0, S || 0);
            tv = isNaN(dt.getTime()) ? null : dt;
          } else {
            tv = parseTimeValue(r[timeKey]);
          }
          if (!tv || isNaN(tv.getTime())) continue;
          const point = { time: tv.toISOString() };
          for (const k of seriesKeys) {
            const v = Number(r[k]);
            if (Number.isFinite(v)) {
              acc[k].count++;
              acc[k].sum += v;
              if (v < acc[k].min) acc[k].min = v;
              if (v > acc[k].max) acc[k].max = v;
              point[k] = v;
            } else {
              point[k] = null;
            }
          }
          if (idx % step === 0) data.push(point);
          if (idx > MAX_POINTS && step === 1) step = Math.ceil(idx / MAX_POINTS);
        }
      });
      p.on("error", reject);
      p.on("end", resolve);
      input.pipe(p);
    });
    const stats = {};
    for (const k of seriesKeys) {
      const c = acc[k].count;
      const sum = acc[k].sum;
      const min = c ? acc[k].min : null;
      const max = c ? acc[k].max : null;
      const mean = c ? sum / c : null;
      stats[k] = { count: c, min, max, mean };
    }
    await fs.promises.unlink(filePath).catch(() => {});
    uploads.set(id, {
      ...uploads.get(id),
      status: "done",
      percent: 100,
      result: { columns: { time: timeKey, series: seriesKeys }, data, stats },
    });
  } catch (e) {
    await fs.promises.unlink(filePath).catch(() => {});
    const j = uploads.get(id);
    if (j) uploads.set(id, { ...j, status: "failed", percent: 100 });
  }
});

app.get("/api/upload-progress/:id", (req, res) => {
  const j = uploads.get(req.params.id);
  if (!j) return res.status(404).json({ error: "Not found" });
  res.json({ status: j.status, percent: j.percent, name: j.name, size: j.size });
});

app.get("/api/upload-progress-sse/:id", (req, res) => {
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
});

app.get("/api/upload-result/:id", (req, res) => {
  const j = uploads.get(req.params.id);
  if (!j) return res.status(404).json({ error: "Not found" });
  if (j.status !== "done") return res.status(202).json({ status: j.status, percent: j.percent });
  res.json(j.result);
});

app.get("/api/uploads", (req, res) => {
  const list = Array.from(uploads.values()).map((j) => ({ id: j.id, name: j.name, size: j.size, status: j.status, percent: j.percent }));
  res.json(list);
});

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
