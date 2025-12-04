import { Modal, Table, Progress, Space, Button, Typography, Tag, Spin } from "antd";
import { useState } from "react";
import { sleep } from "../utils";

export default function UploadHistoryModal({ visible, data = [], onClose, onRefresh }) {
  const [loading, setLoading] = useState(false);
  const columns = [
    {
      title: "文件名",
      dataIndex: "name",
      key: "name",
      width: 420,
      render: (text) => <Typography.Text ellipsis={{ tooltip: text }}>{text}</Typography.Text>,
    },
    {
      title: "大小",
      dataIndex: "size",
      key: "size",
      width: 120,
      render: (v) => (typeof v === "number" ? `${(v / (1024 * 1024)).toFixed(1)} MB` : "-"),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (s) => (
        <Tag color={s === "done" ? "green" : s === "failed" ? "red" : "blue"}>{s}</Tag>
      ),
    },
    {
      title: "进度",
      dataIndex: "percent",
      key: "percent",
      render: (p) => (
        <Progress percent={Number(p) || 0} size="small" status={p === 100 ? "success" : "active"} />
      ),
    },
  ];

  return (
    <Modal
      title="上传历史"
      open={visible}
      onCancel={onClose}
      width={840}
      footer={
        <Space>
          <Button disabled={loading} onClick={onClose}>
            关闭
          </Button>
          <Button
            type="primary"
            loading={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await sleep(300);
                await Promise.resolve(onRefresh && onRefresh());
              } finally {
                setLoading(false);
              }
            }}
          >
            刷新
          </Button>
        </Space>
      }
    >
      <Spin spinning={loading}>
        {data && data.length > 0 ? (
          <Table size="small" rowKey="id" pagination={false} columns={columns} dataSource={data} />
        ) : (
          <Typography.Text>暂无上传历史</Typography.Text>
        )}
      </Spin>
    </Modal>
  );
}
