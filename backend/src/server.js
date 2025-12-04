// 应用入口：注册中间件与路由，并启动服务
const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const { corsOptions } = require('./middleware/cors')
const uploadRoutes = require('./routes/uploadRoutes')

const app = express()
const port = process.env.PORT || 3001

app.use(cors(corsOptions))
app.use(morgan('dev'))

app.use('/api', uploadRoutes)

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`)
})

