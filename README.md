# 01门 (01 Gate)

> 去中心化微任务网络 - AI Agent作为需求方，人类作为供给方

## 项目状态

🏗️ **开发中** - 核心模块基本完成

## 架构

```
01-gate/
├── src/
│   ├── identity/         # 身份模块 (DID)
│   │   └── Identity.js
│   ├── p2p/             # P2P通信模块
│   │   ├── Node.js      # Libp2p节点
│   │   └── VRF.js       # 可验证随机函数
│   ├── task/            # 任务生命周期
│   │   ├── Task.js      # 任务状态机
│   │   └── MatchEngine.js # 匹配引擎
│   ├── settlement/       # 结算模块
│   │   └── Settlement.js
│   ├── blockchain/      # 区块链集成
│   │   └── Ethereum.js
│   ├── core/            # 核心服务
│   │   ├── Reputation.js    # 信誉系统
│   │   ├── Arbitration.js   # 仲裁服务
│   │   └── NotificationService.js # 通知服务
│   └── index.js         # 主入口
├── contracts/           # 智能合约
│   └── StateChannelSettlement.sol
├── package.json
└── README.md
```

## 核心功能

### ✅ 已实现
- [x] 身份生成 (基于以太坊密钥)
- [x] 任务状态机 (完整5阶段+争议)
- [x] P2P节点通信 (Libp2p + GossipSub)
- [x] VRF随机节点选择
- [x] 状态通道结算
- [x] 信誉系统 (链上+链下)
- [x] 仲裁服务
- [x] 通知服务
- [x] 匹配引擎
- [x] Solidity智能合约

### 🔄 开发中
- [ ] 完整区块链集成
- [ ] TEE信用证明
- [ ] Kleros集成
- [ ] 邮件/推送通知

## 安装

```bash
cd 01-gate
npm install
```

## 运行

```bash
# 基础运行
npm start

# 创建测试任务
npm start -- --create-task

# 指定邮箱接收通知
npm start -- --email your@email.com
```

## 模块说明

### Identity (身份模块)
基于公私钥对的去中心化身份 (DID)
- 生成新身份
- 签名/验证
- 持久化存储

### Task (任务模块)
完整的任务生命周期状态机
- PENDING → BROADCASTING → ACCEPTED → IN_PROGRESS → SUBMITTED → COMPLETED
- 支持争议状态 DISPUTED → ARBITRATION

### P2P (P2P通信)
基于Libp2p的分布式网络
- 任务广播 (GossipSub)
- 点对点通信
- VRF防操纵选择

### Settlement (结算)
Layer 2状态通道
- 即时支付
- TEE信用抵押
- 批量微任务结算

### Reputation (信誉)
混合式信誉体系
- 链上关键数据 + 链下海量数据
- 技能标签匹配
- 信誉加速器

### Arbitration (仲裁)
去中心化仲裁
- 48小时申诉窗口
- 陪审团投票
- LQC逻辑质量系数
- 零知识证明隐私投票

## 智能合约

```bash
# 编译
npx hardhat compile

# 部署
npx hardhat run scripts/deploy.js
```

## 配置

配置文件: `src/config.js`

```javascript
module.exports = {
  // P2P配置
  port: 0, // 随机端口
  bootstrapNodes: [],
  
  // 角色
  role: 'agent', // 'agent' | 'human'
  isAutoAccept: false,
  
  // 通知
  email: null,
  
  // 心跳间隔
  heartbeatInterval: 900000 // 15分钟
};
```

## CLI

```bash
# 查看状态
node src/index.js --status

# 创建任务
node src/index.js --create-task --title "翻译文档" --budget 50

# 查看任务列表
node src/index.js --list-tasks
```

## 测试

```bash
npm test
```

## 文档

详细产品文档: [飞书wiki](https://scnwv3mk9ctw.feishu.cn/wiki/BzgvwwsPRiSZgekwAq1cTTxrn0g)

## License

MIT
