import { useMemo, useState, useCallback, useEffect } from "react";
import "./styles/app.less";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
dayjs.locale("zh-cn");
import {
  Layout,
  Typography,
  Space,
  Card,
  DatePicker,
  Row,
  Col,
  Segmented,
  Divider,
  Grid,
  Button,
  ConfigProvider,
} from "antd";
import zhCN from "antd/locale/zh_CN";
import axios from "axios";
import { DeleteOutlined } from "@ant-design/icons";
import { UploadCsv, StatsList, TimeSeriesChart, UploadHistoryModal } from "./components";

function App() {
  const [dataset, setDataset] = useState([]);
  const [seriesKeys, setSeriesKeys] = useState([]);
  const [stats, setStats] = useState({});
  const [range, setRange] = useState({ start: "", end: "" });
  const [chartType, setChartType] = useState("line");
  const [fileList, setFileList] = useState([]);
  const [selectedUid, setSelectedUid] = useState(null);
  const [payloadByUid, setPayloadByUid] = useState({});
  const [serverUploads, setServerUploads] = useState([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const API_BASE =
    typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL
      : "http://localhost:3001";
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const chartHeight = useMemo(() => {
    if (isMobile) return 320;
    if (screens.xl) return 520;
    if (screens.lg) return 460;
    if (screens.md) return 420;
    return 400;
  }, [screens, isMobile]);
  const selectedFileName = useMemo(() => {
    const f = fileList.find((x) => x.uid === selectedUid);
    return f?.name || "";
  }, [fileList, selectedUid]);

  const filtered = useMemo(() => {
    if (!range.start || !range.end) return dataset;
    const s = dayjs(range.start);
    const e = dayjs(range.end);
    return dataset.filter((d) => {
      const t = dayjs(d.time);
      return (t.isAfter(s) || t.isSame(s)) && (t.isBefore(e) || t.isSame(e));
    });
  }, [dataset, range]);

  const computedStats = useMemo(() => {
    const out = {};
    seriesKeys.forEach((k) => {
      const values = filtered.map((d) => d[k]).filter((v) => typeof v === "number");
      const sum = values.reduce((a, b) => a + b, 0);
      const min = values.length ? Math.min(...values) : null;
      const max = values.length ? Math.max(...values) : null;
      const mean = values.length ? sum / values.length : null;
      out[k] = { count: values.length, min, max, mean };
    });
    return out;
  }, [filtered, seriesKeys]);

  const gradients = [
    ["#60a5fa", "#1d4ed8"],
    ["#34d399", "#059669"],
    ["#f472b6", "#db2777"],
    ["#f59e0b", "#b45309"],
  ];

  const handleUploadSuccess = useCallback((payload) => {
    // payload is result for last uploaded file; actual selection handled via onParsed meta below
  }, []);

  const onParsed = useCallback((meta, payload) => {
    setPayloadByUid((prev) => ({ ...prev, [meta.uid]: payload }));
    setFileList((prev) => {
      const exists = prev.find((f) => f.uid === meta.uid);
      if (exists) return prev;
      return [...prev, { uid: meta.uid, name: meta.name }];
    });
    // Always auto-select the newly uploaded file
    setSelectedUid(meta.uid);
    setDataset(payload.data || []);
    setSeriesKeys(payload.columns?.series || []);

    setStats(payload.stats || {});
    setTimeout(async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/uploads`);
        setServerUploads(res.data || []);
      } catch {}
    }, 0);
    if (payload.data && payload.data.length) {
      setRange({ start: payload.data[0].time, end: payload.data[payload.data.length - 1].time });
    } else {
      setRange({ start: "", end: "" });
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/uploads`);
        if (mounted) setServerUploads(res.data || []);
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, [API_BASE]);

  const applySelection = useCallback(
    (uid) => {
      setSelectedUid(uid);
      const payload = payloadByUid[uid];
      if (!payload) {
        setDataset([]);
        setSeriesKeys([]);
        setStats({});
        setRange({ start: "", end: "" });
        return;
      }
      setDataset(payload.data);
      setSeriesKeys(payload.columns.series);

      setStats(payload.stats);
      if (payload.data && payload.data.length) {
        setRange({ start: payload.data[0].time, end: payload.data[payload.data.length - 1].time });
      } else {
        setRange({ start: "", end: "" });
      }
    },
    [payloadByUid],
  );

  const onFileListChange = useCallback(
    (list) => {
      // list is Antd file list; keep names for selection UI
      // prune payloads for removed files
      const uids = new Set(list.map((f) => f.uid));
      setPayloadByUid((prev) => {
        const next = {};
        Object.keys(prev).forEach((k) => {
          if (uids.has(k)) next[k] = prev[k];
        });
        return next;
      });
      setFileList(list.map((f) => ({ uid: f.uid, name: f.name })));
      // if current selection removed, clear selection and data
      if (selectedUid && !uids.has(selectedUid)) {
        const first = list[0];
        applySelection(first ? first.uid : null);
      } else if (!selectedUid && list.length > 0) {
        applySelection(list[0].uid);
      }
    },
    [applySelection, selectedUid],
  );

  const onRemove = useCallback(
    (file) => {
      // explicit removal handler to clear when removing selected file
      if (selectedUid && file.uid === selectedUid) {
        const next = fileList.filter((f) => f.uid !== file.uid);
        const first = next[0];
        applySelection(first ? first.uid : null);
      }
    },
    [applySelection, fileList, selectedUid],
  );

  const handleRemoveByUid = useCallback(
    (uid) => {
      const next = fileList.filter((f) => f.uid !== uid);
      const uids = new Set(next.map((f) => f.uid));
      setFileList(next);
      setPayloadByUid((prev) => {
        const out = {};
        Object.keys(prev).forEach((k) => {
          if (uids.has(k)) out[k] = prev[k];
        });
        return out;
      });
      if (selectedUid === uid) {
        applySelection(next[0]?.uid || null);
      }
    },
    [applySelection, fileList, selectedUid],
  );

  const fetchUploads = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/uploads`);
      setServerUploads(res.data || []);
    } catch {}
  }, [API_BASE]);
  // 打开上传历史弹框：先刷新历史列表，再显示
  const openHistory = useCallback(async () => {
    await fetchUploads();
    setHistoryVisible(true);
  }, [fetchUploads]);

  return (
    <ConfigProvider locale={zhCN}>
      <Layout className="app-wrapper" style={{ minHeight: "100vh" }}>
        <Layout.Header className="header">
          <Space
            align="center"
            wrap
            style={{ width: "100%", justifyContent: isMobile ? "flex-start" : "space-between" }}
          >
            <Typography.Title level={3} style={{ margin: 0, color: "#fff" }}>
              时序数据可视化
            </Typography.Title>
          </Space>
        </Layout.Header>
        <Layout.Content className="content">
          <Row gutter={[16, 0]} className="main-row" align="stretch" wrap={false}>
            <Col xs={24} className="sidebar-fixed">
              <Card className="panel sidebar-card" title="数据设置">
                <UploadCsv
                  onSuccess={handleUploadSuccess}
                  onParsed={onParsed}
                  onFileListChange={onFileListChange}
                  onRemove={onRemove}
                  existingNames={fileList.map((f) => f.name)}
                />
                {fileList.length === 0 ? (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>暂无文件</div>
                    <Button size="small" onClick={openHistory}>
                      查看上传历史
                    </Button>
                  </div>
                ) : (
                  <Space orientation="vertical" style={{ width: "100%" }}>
                    <div
                      className="file-summary"
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        已上传文件：<span className="file-count">{fileList.length}</span>
                      </div>
                      <Button size="small" onClick={openHistory}>
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
                              handleRemoveByUid(f.uid);
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
            </Col>
            <Col xs={24} className="chart-flex">
              <Card
                className="panel chart-card"
                title="可视化"
                extra={
                  <Space>
                    <Segmented
                      value={chartType}
                      onChange={setChartType}
                      options={[
                        { label: "折线图", value: "line" },
                        { label: "柱状图", value: "bar" },
                      ]}
                    />
                  </Space>
                }
                style={{ height: "100%" }}
              >
                {selectedUid ? (
                  <TimeSeriesChart
                    seriesKeys={seriesKeys}
                    filtered={filtered}
                    gradients={gradients}
                    chartType={chartType}
                    height={chartHeight}
                  />
                ) : (
                  <div className="empty-state" style={{ height: chartHeight }}>
                    请上传并选择文件
                  </div>
                )}
                {selectedUid && seriesKeys.length > 0 && (
                  <>
                    <Divider style={{ margin: "12px 0" }} />
                    <div className="stats-block">
                      <div className="stats-header">
                        <Typography.Text className="stats-title">统计摘要</Typography.Text>
                        {selectedFileName && <span className="chip">{selectedFileName}</span>}
                        {/* {range.start && range.end && (
                        <span className="chip">{dayjs(range.start).format('YYYY-MM-DD HH:mm')} → {dayjs(range.end).format('YYYY-MM-DD HH:mm')}</span>
                      )} */}
                      </div>
                      <StatsList
                        seriesKeys={seriesKeys}
                        stats={computedStats}
                        gradients={gradients}
                      />
                    </div>
                  </>
                )}
              </Card>
            </Col>
          </Row>
        </Layout.Content>
        <UploadHistoryModal
          visible={historyVisible}
          data={serverUploads}
          onClose={() => setHistoryVisible(false)}
          onRefresh={fetchUploads}
        />
      </Layout>
    </ConfigProvider>
  );
}

export default App;
