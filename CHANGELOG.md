# 更新日志

## [0.3.0] - 2026-03-02

### 新增功能

#### 端到端加密通信 (src/core/Communication.js)
- ECDH 密钥交换
- AES-256-GCM 加密
- Agent 间安全通道
- 消息类型：任务请求、进度更新、交付物、验收

#### 人格证明模块 (src/core/ProofOfPersonhood.js)
- Gitcoin Passport 集成
- 多层级验证 (Basic → Premium)
- 防女巫攻击
- 验证中间件

#### 代币经济模块 (src/core/Economics.js)
- 动态归属计划 (基于 KPI)
- 手续费机制 (分阶段费率)
- 效用质押 (Utility Staking)
- 价值捕获 (销毁 + 金库)

#### 支付网关 (src/core/Payment.js)
- 稳定币支付 (USDC, USDT, DAI)
- 法币支付支持
- 汇率兑换服务
- 法币 ↔ 加密货币转换

#### 移动端适配 (src/mobile/MobileClient.js)
- iOS 轻量级客户端
- Android 客户端 (Wasm 支持)
- 推送通知 (APNS/FCM)
- 间歇性同步

---

## [0.2.0] - 2026-03-02

### 新增功能

#### P2P网络模块 (src/p2p/Network.js)
- 集成 Libp2p 实现完整的P2P通信
- Kademlia DHT 节点发现与路由
- GossipSub 协议支持任务广播网格
- 支持连接引导节点
- 主题订阅与发布机制

#### 隐私保护模块 (src/core/Privacy.js)
- GeoHash 地理位置编码
- 局部差异隐私 (Local Differential Privacy) 实现
- 基于网络密度的动态位置精度调整
- 拉普拉斯机制和指数机制
- 任务数据隐私保护
- 聚合查询差分隐私

#### 监控模块 (src/core/Monitoring.js)
- Prometheus 指标收集器
- 系统指标 (CPU, 内存, 运行时间)
- 网络指标 (任务统计, 节点数)
- HTTP 端点 (/metrics, /health, /stats)
- 支持 Grafana 集成

#### 安全框架 (src/core/Security.js)
- 多层安全拦截机制
- 边缘端语义预检 (Prompt Injection 检测)
- TEE 内深度意图分析
- 网络行为模式分析
- 安全事件日志与合规报告生成

### 模块更新

#### 核心模块
- Credit.js - TEE 信用证明模块优化
- Kleros.js - 仲裁流程完善
- Settlement.js - 状态通道结算增强
- Task.js - 任务状态机完善

### 依赖更新
- 新增 libp2p 生态系统依赖
- 新增 multiaddr, uint8arrays 工具库

---

## [0.1.0] - 2026-03-01

### 初始版本

核心功能：
- 分布式身份 (DID)
- 任务生命周期管理
- VRF 随机节点选择
- 信誉系统
- 仲裁服务
- 通知服务
