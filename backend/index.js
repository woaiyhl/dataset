const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const multer = require("multer");
const { parse } = require("csv-parse");

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({ origin: "http://localhost:5173" }));
app.use(morgan("dev"));

const upload = multer({ storage: multer.memoryStorage() });

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const buffer = req.file.buffer;
  const records = [];
  let headers = null;

  const parser = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  parser.on("headers", (h) => {
    headers = h;
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
      // Assume first column is time-like
      const timeKey = headers[0];
      const seriesKeys = headers.slice(1);

      const data = records.map((r) => {
        const point = { time: new Date(r[timeKey]).toISOString() };
        seriesKeys.forEach((k) => {
          const v = Number(r[k]);
          point[k] = Number.isFinite(v) ? v : null;
        });
        return point;
      });

      const stats = {};
      seriesKeys.forEach((k) => {
        const values = data.map((d) => d[k]).filter((v) => typeof v === "number");
        const sum = values.reduce((a, b) => a + b, 0);
        const min = values.length ? Math.min(...values) : null;
        const max = values.length ? Math.max(...values) : null;
        const mean = values.length ? sum / values.length : null;
        stats[k] = { count: values.length, min, max, mean };
      });

      res.json({ columns: { time: timeKey, series: seriesKeys }, data, stats });
    } catch (e) {
      res.status(500).json({ error: "Processing error", detail: e.message });
    }
  });

  parser.write(buffer);
  parser.end();
});

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
