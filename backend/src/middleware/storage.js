// Multer 存储配置：统一上传目录与大小限制
const path = require('path')
const fs = require('fs')
const multer = require('multer')

const uploadDir = path.join(__dirname, '..', '..', 'uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const upload = multer({ dest: uploadDir, limits: { fileSize: 1024 * 1024 * 1024 } })

module.exports = { upload, uploadDir }

