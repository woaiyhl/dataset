import { Card, Space, Typography, DatePicker, Divider, Button } from "antd";
import dayjs from "dayjs";
import { DeleteOutlined } from "@ant-design/icons";
import UploadCsv from "./UploadCsv";

export default function SidebarPanel({
  fileList,
  selectedUid,
  onUploadSuccess,
  onParsed,
  onFileListChange,
  onRemove,
  onRemoveByUid,
  applySelection,
  openHistory,
  range,
  setRange,
}) {
  return (
    <Card className="panel sidebar-card" title="数据设置">
      <UploadCsv
        onSuccess={onUploadSuccess}
        onParsed={onParsed}
        onFileListChange={onFileListChange}
        onRemove={onRemove}
        existingNames={fileList.map((f) => f.name)}
      />
      {fileList.length === 0 ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>暂无文件</div>
          <Button size="small" type="link" onClick={openHistory}>
            查看上传历史
          </Button>
        </div>
      ) : (
        <Space orientation="vertical" style={{ width: "100%" }}>
          <div
            className="file-summary"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <div>
              已上传文件：<span className="file-count">{fileList.length}</span>
            </div>
            <Button size="small" type="link" onClick={openHistory}>
              查看上传历史
            </Button>
          </div>
          <div className="file-list">
            {fileList.map((f) => (
              <div
                key={f.uid}
                className={`file-item${selectedUid === f.uid ? " selected" : ""}`}
                onClick={() => applySelection(f.uid)}
              >
                <span className={`file-name${selectedUid === f.uid ? " selected" : ""}`}>
                  {f.name}
                </span>
                <span
                  className="file-action"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveByUid(f.uid);
                  }}
                  title="删除"
                >
                  <DeleteOutlined />
                </span>
              </div>
            ))}
          </div>
        </Space>
      )}
      <Divider style={{ margin: "8px 0" }} />
      <Space orientation="vertical">
        <Typography.Text>选择时间范围：</Typography.Text>
        <DatePicker.RangePicker
          showTime
          value={range.start && range.end ? [dayjs(range.start), dayjs(range.end)] : null}
          onChange={(vals) => {
            if (!vals) return setRange({ start: "", end: "" });
            setRange({ start: vals[0].toISOString(), end: vals[1].toISOString() });
          }}
          style={{ width: "100%" }}
          placeholder={["开始时间", "结束时间"]}
        />
      </Space>
    </Card>
  );
}
