// 全局上传任务存储与 ID 生成器
// 说明：为了在不同路由/控制器之间共享进度状态，这里集中维护一个内存 Map。
// 在生产环境可替换为 Redis 等持久化存储。

const uploads = new Map()

const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

module.exports = { uploads, genId }

