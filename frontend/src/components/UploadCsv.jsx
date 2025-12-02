import axios from 'axios'
import { Upload, message } from 'antd'

const DEFAULT_API = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) ? `${import.meta.env.VITE_API_URL}/api/upload` : 'http://localhost:3001/api/upload'
export default function UploadCsv({ endpoint = DEFAULT_API, accept = '.csv', onSuccess, onParsed, onFileListChange, onRemove, existingNames = [] }) {
  const seen = new Set(existingNames)
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
      return true
    },
    customRequest: async ({ file, onSuccess: ok, onError }) => {
      try {
        const form = new FormData()
        form.append('file', file)
        const res = await axios.post(endpoint, form)
        onSuccess && onSuccess(res.data)
        onParsed && onParsed({ uid: file.uid, name: file.name }, res.data)
        ok && ok('ok')
      } catch (e) {
        onError && onError(e)
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
    </Upload.Dragger>
  )
}
