// 路由注册：健康检查、上传与进度相关接口
const express = require("express");
const router = express.Router();
const { upload } = require("../middleware/storage");
const ctrl = require("../controllers/uploadController");

router.get("/health", (req, res) => res.json({ status: "ok" }));

router.post("/upload", upload.single("file"), ctrl.uploadImmediate);
router.post("/upload-chunk/init", ctrl.chunkInit);
router.post("/upload-chunk", upload.single("chunk"), ctrl.chunkUpload);
router.post("/upload-chunk/complete", ctrl.chunkComplete);
router.get("/upload-progress/:id", ctrl.uploadProgress);
router.get("/upload-progress-sse/:id", ctrl.uploadProgressSSE);
router.get("/upload-result/:id", ctrl.uploadResult);
router.get("/uploads", ctrl.uploadList);

module.exports = router;
