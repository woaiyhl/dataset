import axios from "axios";
import { Upload, message } from "antd";
import { useMemo, useState } from "react";

const DEFAULT_BASE =
  typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : "http://localhost:3001/api";
export default function UploadCsv({
  endpointBase = DEFAULT_BASE,
  accept = ".csv",
  onSuccess,
  onParsed,
  onFileListChange,
  onRemove,
  existingNames = [],
}) {
  const [progress, setProgress] = useState({});
  const seen = new Set(existingNames);
  const uploadingCount = useMemo(() => Object.keys(progress).length, [progress]);
  const totalPercent = useMemo(() => {
    const keys = Object.keys(progress);
    if (keys.length === 0) return 0;
    let sum = 0;
    keys.forEach((k) => {
      sum += progress[k]?.percent || 0;
    });
    return Math.round(sum / keys.length);
  }, [progress]);
  const props = {
    name: "file",
    accept,
    multiple: true,
    showUploadList: false,
    beforeUpload: (file) => {
      const key = file.name;
      if (seen.has(key)) {
        message.error(
          `文件已存在：${key}。为避免重复数据，已忽略此次上传。请更换文件或删除现有同名文件后重试。`,
        );
        return Upload.LIST_IGNORE;
      }
      seen.add(key);
      setProgress((p) => ({ ...p, [file.uid]: { name: file.name, percent: 0 } }));
      return true;
    },
    customRequest: async ({ file, onSuccess: ok, onError, onProgress }) => {
      try {
        const CHUNK_SIZE = 5 * 1024 * 1024;
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const initRes = await axios.post(`${endpointBase}/upload-chunk/init`, {
          name: file.name,
          size: file.size,
          chunkSize: CHUNK_SIZE,
        });
        const jobId = initRes.data?.uploadId;
        if (!jobId) throw new Error("初始化上传失败");

        let uploadedBytes = 0;
        const uploadChunk = async (idx) => {
          const start = idx * CHUNK_SIZE;
          const end = Math.min(file.size, start + CHUNK_SIZE);
          const blob = file.slice(start, end);
          const form = new FormData();
          form.append("chunk", blob);
          form.append("uploadId", jobId);
          form.append("index", idx);
          form.append("total", totalChunks);
          await axios.post(`${endpointBase}/upload-chunk`, form, {
            onUploadProgress: (evt) => {
              if (evt.loaded) {
                uploadedBytes += evt.loaded;
                const p = Math.max(1, Math.min(95, Math.floor((uploadedBytes / file.size) * 100)));
                setProgress((prev) => ({
                  ...prev,
                  [file.uid]: { ...(prev[file.uid] || { name: file.name }), percent: p },
                }));
                onProgress && onProgress({ percent: p });
              }
            },
          });
        };

        const concurrency = 4;
        const queue = Array.from({ length: totalChunks }, (_, i) => i);
        const workers = Array.from({ length: Math.min(concurrency, totalChunks) }, async () => {
          while (queue.length) {
            const idx = queue.shift();
            await uploadChunk(idx);
          }
        });
        await Promise.all(workers);

        await axios.post(`${endpointBase}/upload-chunk/complete`, {
          uploadId: jobId,
          total: totalChunks,
        });

        let finished = false;
        const es = new EventSource(`${endpointBase}/upload-progress-sse/${jobId}`);
        es.onmessage = async (evt) => {
          try {
            const info = JSON.parse(evt.data);
            if (typeof info.percent === "number") {
              setProgress((prev) => ({
                ...prev,
                [file.uid]: { ...(prev[file.uid] || { name: file.name }), percent: info.percent },
              }));
              onProgress && onProgress({ percent: info.percent });
            }
            if (info.status === "done" && !finished) {
              finished = true;
              es.close();
              const result = await axios.get(`${endpointBase}/upload-result/${jobId}`);
              onSuccess && onSuccess(result.data);
              onParsed && onParsed({ uid: file.uid, name: file.name }, result.data);
              ok && ok("ok");
              setProgress((prev) => {
                const { [file.uid]: _, ...rest } = prev;
                return rest;
              });
            }
            if (info.status === "failed" && !finished) {
              finished = true;
              es.close();
              message.error("服务器解析失败，请检查数据格式或稍后重试");
              setProgress((prev) => {
                const { [file.uid]: _, ...rest } = prev;
                return rest;
              });
            }
          } catch {}
        };
        es.onerror = async () => {
          es.close();
          try {
            const timer = setInterval(async () => {
              try {
                const info = await axios.get(`${endpointBase}/upload-progress/${jobId}`);
                const pct = Number(info.data?.percent) || 0;
                setProgress((prev) => ({
                  ...prev,
                  [file.uid]: { ...(prev[file.uid] || { name: file.name }), percent: pct },
                }));
                onProgress && onProgress({ percent: pct });
                if (info.data?.status === "done" && !finished) {
                  finished = true;
                  clearInterval(timer);
                  const result = await axios.get(`${endpointBase}/upload-result/${jobId}`);
                  onSuccess && onSuccess(result.data);
                  onParsed && onParsed({ uid: file.uid, name: file.name }, result.data);
                  ok && ok("ok");
                  setProgress((prev) => {
                    const { [file.uid]: _, ...rest } = prev;
                    return rest;
                  });
                }
                if (info.data?.status === "failed" && !finished) {
                  finished = true;
                  clearInterval(timer);
                  message.error("服务器解析失败，请检查数据格式或稍后重试");
                  setProgress((prev) => {
                    const { [file.uid]: _, ...rest } = prev;
                    return rest;
                  });
                }
              } catch {}
            }, 500);
          } catch {}
        };

        const resultPoller = setInterval(async () => {
          if (finished) {
            clearInterval(resultPoller);
            return;
          }
          try {
            const res = await axios.get(`${endpointBase}/upload-result/${jobId}`, {
              validateStatus: () => true,
            });
            if (res.status === 200) {
              finished = true;
              onSuccess && onSuccess(res.data);
              onParsed && onParsed({ uid: file.uid, name: file.name }, res.data);
              ok && ok("ok");
              setProgress((prev) => {
                const { [file.uid]: _, ...rest } = prev;
                return rest;
              });
              clearInterval(resultPoller);
            }
          } catch (e) {
            // 202 未完成时继续轮询；其他错误忽略
          }
        }, 1000);
      } catch (e) {
        const data = e?.response?.data;
        const msg = data?.error
          ? `${data.error}${data?.detail ? `：${data.detail}` : ""}`
          : e?.message || "上传失败";
        message.error(msg);
        onError && onError(e);
      } finally {
        // 保持进度项，直至 done/failed 分支移除
      }
    },
    onChange: (info) => {
      onFileListChange && onFileListChange(info.fileList || []);
    },
    onRemove: (file) => {
      onRemove && onRemove(file);
    },
  };
  return (
    <>
      <Upload.Dragger {...props} className="upload-drag-fixed">
        <div>拖拽或点击上传 .csv 文件</div>
      </Upload.Dragger>
      {uploadingCount > 0 && (
        <div style={{ marginTop: 8, width: "100%" }}>
          <div style={{ fontSize: 12, color: "#cbd5e1" }}>
            上传中（{uploadingCount}） {totalPercent}%
          </div>
          <div style={{ height: 6, background: "#1f2937", borderRadius: 4, overflow: "hidden" }}>
            <div
              style={{
                width: `${totalPercent}%`,
                height: "100%",
                background: "#4f46e5",
                transition: "width 0.2s ease",
              }}
            />
          </div>
          <div style={{ marginTop: 6 }}>
            {Object.entries(progress).map(([uid, info]) => (
              <div
                key={uid}
                style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}
              >
                <span style={{ flex: "0 0 auto", fontSize: 12, color: "#cbd5e1" }}>
                  {info.name}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 6,
                    background: "#111827",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${info.percent}%`,
                      height: "100%",
                      background: "#22c55e",
                      transition: "width 0.2s ease",
                    }}
                  />
                </div>
                <span style={{ flex: "0 0 auto", fontSize: 12, color: "#cbd5e1" }}>
                  {info.percent}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
