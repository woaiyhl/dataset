// CORS 配置：允许本地开发端口访问

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    const ok = /http:\/\/localhost:\d+/.test(origin) || /http:\/\/127\.0\.0\.1:\d+/.test(origin)
    callback(null, ok ? true : false)
  }
}

module.exports = { corsOptions }

