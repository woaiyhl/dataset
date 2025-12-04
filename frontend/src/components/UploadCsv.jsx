import axios from 'axios'
import { Upload, message } from 'antd'
import { useMemo, useState } from 'react'

const DEFAULT_API = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) ? `${import.meta.env.VITE_API_URL}/api/upload-stream` : 'http://localhost:3001/api/upload-stream'
export default function UploadCsv({ endpoint = DEFAULT_API, accept = '.csv', onSuccess, onParsed, onFileListChange, onRemove, existingNames = [] }) {
  const [progress, setProgress] = useState({})
  const seen = new Set(existingNames)
  const uploadingCount = useMemo(() => Object.keys(progress).length, [progress])
  const totalPercent = useMemo(() => {
    const keys = Object.keys(progress)
    if (keys.length === 0) return 0
    let sum = 0
    keys.forEach(k => { sum += (progress[k]?.percent || 0) })
    return Math.round(sum / keys.length)
  }, [progress])
  const props = {
    name: 'file',
    accept,
    multiple: true,
    showUploadList: false,
    beforeUpload: (file) => {
      const key = file.name
      if (seen.has(key)) {
        message.error(`文件已存在：${key}。为避免重复数据，已忽略此次上传。请更换文件或删除现有同名文件后重试。`)
        return Upload.LIST_IGNORE
      }
      seen.add(key)
      setProgress(p => ({ ...p, [file.uid]: { name: file.name, percent: 0 } }))
      return true
    },
    customRequest: async ({ file, onSuccess: ok, onError, onProgress }) => {
      try {
        const form = new FormData()
        form.append('file', file)
        const res = await axios.post(endpoint, form, {
          onUploadProgress: (evt) => {
            const p = evt.total ? Math.round((evt.loaded / evt.total) * 100) : Math.min(99, ((progress[file.uid]?.percent) || 0) + 1)
            setProgress(prev => ({ ...prev, [file.uid]: { ...(prev[file.uid] || { name: file.name }), percent: p } }))
            onProgress && onProgress({ percent: p })
          }
        })
        const jobId = res.data?.jobId
        let base = ''
        try {
          base = new URL(endpoint).origin
        } catch {
          base = endpoint.replace(/\/api\/upload-stream$/, '')
        }
        if (jobId) {
          const es = new EventSource(`${base}/api/upload-progress-sse/${jobId}`)
          es.onmessage = async (evt) => {
            try {
              const info = JSON.parse(evt.data)
              if (typeof info.percent === 'number') {
                setProgress(prev => ({ ...prev, [file.uid]: { ...(prev[file.uid] || { name: file.name }), percent: info.percent } }))
                onProgress && onProgress({ percent: info.percent })
              }
              if (info.status === 'done') {
                es.close()
                const result = await axios.get(`${base}/api/upload-result/${jobId}`)
                onSuccess && onSuccess(result.data)
                onParsed && onParsed({ uid: file.uid, name: file.name }, result.data)
                ok && ok('ok')
                setProgress(prev => {
                  const { [file.uid]: _, ...rest } = prev
                  return rest
                })
              }
            } catch {}
          }
          es.onerror = async () => {
            es.close()
            try {
              const timer = setInterval(async () => {
                try {
                  const info = await axios.get(`${base}/api/upload-progress/${jobId}`)
                  const pct = Number(info.data?.percent) || 0
                  setProgress(prev => ({ ...prev, [file.uid]: { ...(prev[file.uid] || { name: file.name }), percent: pct } }))
                  onProgress && onProgress({ percent: pct })
                  if (info.data?.status === 'done') {
                    clearInterval(timer)
                    const result = await axios.get(`${base}/api/upload-result/${jobId}`)
                    onSuccess && onSuccess(result.data)
                    onParsed && onParsed({ uid: file.uid, name: file.name }, result.data)
                    ok && ok('ok')
                    setProgress(prev => { const { [file.uid]: _, ...rest } = prev; return rest })
                  }
                } catch {}
              }, 500)
            } catch {}
          }
        } else {
          onSuccess && onSuccess(res.data)
          onParsed && onParsed({ uid: file.uid, name: file.name }, res.data)
          ok && ok('ok')
        }
      } catch (e) {
        const data = e?.response?.data
        const msg = data?.error ? `${data.error}${data?.detail ? `：${data.detail}` : ''}` : (e?.message || '上传失败')
        message.error(msg)
        onError && onError(e)
      } finally {
        setProgress(prev => {
          const { [file.uid]: _, ...rest } = prev
          return rest
        })
      }
    },
    onChange: (info) => {
      onFileListChange && onFileListChange(info.fileList || [])
    },
    onRemove: (file) => {
      onRemove && onRemove(file)
    },
  }
  return (
    <Upload.Dragger {...props} className="upload-drag-fixed">
      <div>拖拽或点击上传 .csv 文件</div>
      {uploadingCount > 0 && (
        <div style={{ marginTop: 8, width: '100%' }}>
          <div style={{ fontSize: 12, color: '#cbd5e1' }}>上传中（{uploadingCount}） {totalPercent}%</div>
          <div style={{ height: 6, background: '#1f2937', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${totalPercent}%`, height: '100%', background: '#4f46e5', transition: 'width 0.2s ease' }} />
          </div>
          <div style={{ marginTop: 6 }}>
            {Object.entries(progress).map(([uid, info]) => (
              <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ flex: '0 0 auto', fontSize: 12, color: '#cbd5e1' }}>{info.name}</span>
                <div style={{ flex: 1, height: 6, background: '#111827', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${info.percent}%`, height: '100%', background: '#22c55e', transition: 'width 0.2s ease' }} />
                </div>
                <span style={{ flex: '0 0 auto', fontSize: 12, color: '#cbd5e1' }}>{info.percent}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Upload.Dragger>
  )
}
