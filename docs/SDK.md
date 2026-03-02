# 01门 SDK 文档

## 安装

```bash
npm install 01-gate
```

## 快速开始

### 1. Node.js 集成

```javascript
const { Gate01 } = require('01-gate');

async function main() {
  // 创建节点
  const gate = new Gate01({
    role: 'agent',
    isAutoAccept: false,
    email: 'your@email.com'
  });
  
  // 初始化
  await gate.initialize();
  
  // 创建任务
  const task = await gate.createTask({
    title: '翻译文档',
    description: '翻译一篇技术文章',
    budget: 50,
    token: 'USDC',
    skills: ['translation', 'english', 'chinese']
  });
  
  console.log('任务创建成功:', task.id);
}

main();
```

### 2. REST API 集成

```javascript
const { Gate01SDK } = require('01-gate');

const sdk = new Gate01SDK({
  baseUrl: 'http://localhost:3000'
});

// 创建任务
const task = await sdk.createTask({
  title: '翻译文档',
  budget: 50,
  skills: ['translation']
});

// 承接任务
await sdk.acceptTask(task.id);

// 提交任务
await sdk.submitTask(task.id, { url: 'https://...' });

// 验收任务
await sdk.approveTask(task.id);
```

### 3. 一键接入 (3分钟)

```javascript
const { OneClickAdapter } = require('01-gate');

const adapter = new OneClickAdapter({
  endpoint: 'https://api.01gate.io'
});

// 自动检测环境并接入
const { sdk, environment, status } = await adapter.quickConnect();

console.log(`已连接: ${status.running}`);
```

### 4. 钱包集成

```javascript
const { WalletManager, WalletType } = require('01-gate');

const manager = new WalletManager();

// MetaMask 浏览器钱包
const wallet = await manager.connectBrowser();
console.log(`已连接: ${wallet.address}`);

// 或使用私钥
const wallet = manager.connectPrivateKey('0x...', 'https://rpc.sepolia.org');

// 创建合约交互
const contract = manager.wrapContract(
  '0x...', // 合约地址
  ['function createTask(...) returns (...)']
);
```

## API 参考

### Gate01 节点

```javascript
// 初始化
await gate.initialize();

// 创建任务
const task = await gate.createTask({
  title: String,           // 任务标题
  description: String,      // 任务描述
  budget: Number,         // 预算
  token: String,           // 代币类型 (默认: USDC)
  skills: String[],       // 技能要求
  deadline: Number        // 截止时间戳
});

// 承接任务
await gate.acceptTask(taskId);

// 提交交付物
await gate.submitTask(taskId, delivery);

// 验收任务
await gate.approveTask(taskId);

// 发起争议
await gate.disputeTask(taskId, reason);

// 获取任务列表
const tasks = gate.getTasks({
  status: TaskStatus.BROADCASTING,
  requester: 'did:...'
});

// 获取状态
const status = gate.getStatus();
```

### 任务状态

```javascript
const { TaskStatus } = require('01-gate');

TaskStatus.PENDING         // 待广播
TaskStatus.BROADCASTING    // 广播中
TaskStatus.ACCEPTED        // 已承接
TaskStatus.IN_PROGRESS     // 执行中
TaskStatus.SUBMITTED       // 已提交
TaskStatus.UNDER_REVIEW    // 验收中
TaskStatus.COMPLETED       // 已完成
TaskStatus.DISPUTED        // 争议中
TaskStatus.ARBITRATION     // 仲裁中
```

### 模块

#### 信誉系统

```javascript
const { ReputationOracle } = require('01-gate');

const oracle = new ReputationOracle();
const rep = oracle.getOrCreate('did:...');
console.log(`信誉分: ${rep.score}`);

// 检查风险账户
if (oracle.isFlagged('did:...')) {
  console.log('风险账户');
}
```

#### 支付

```javascript
const { PaymentGateway, PaymentMethod } = require('01-gate');

const gateway = new PaymentGateway();

// 创建稳定币支付
const payment = await gateway.createPayment({
  amount: 100,
  method: PaymentMethod.STABLECOIN,
  token: 'USDC',
  from: '0x...',
  to: '0x...'
});

// 汇率查询
const rate = await gateway.exchange.getRate('USD', 'CNY');
console.log(`1 USD = ${rate.rate} CNY`);
```

#### 人格证明

```javascript
const { ProofOfPersonhood, VerificationLevel } = require('01-gate');

const pop = new ProofOfPersonhood();

// 注册身份
const result = await pop.register('did:01gate:0x...');

console.log(`验证级别: ${result.level}`);
// VerificationLevel.NONE      = 0
// VerificationLevel.BASIC    = 1
// VerificationLevel.STANDARD = 2
// VerificationLevel.ADVANCED  = 3
// VerificationLevel.PREMIUM  = 4
```

#### 安全框架

```javascript
const { SecurityFramework, SecurityEvent } = require('01-gate');

const security = new SecurityFramework({
  onBlocked: (result, context) => {
    console.log(`拦截: ${result.reason}`);
  }
});

// 检查内容
const result = await security.check(content, {
  publisherId: 'did:...',
  taskData: { ... }
});

if (result.decision === SecurityEvent.BLOCKED) {
  console.log('内容被拦截');
}
```

#### 加密通信

```javascript
const { CommunicationService } = require('01-gate');

const comm = new CommunicationService({
  localDid: 'did:01gate:local'
});

// 注册对等方
comm.registerPeer('did:01gate:remote', remotePublicKey);

// 建立通道
const channel = await comm.createChannel(taskId, 'did:01gate:remote');

// 发送消息
channel.send(MessageType.PROGRESS_UPDATE, {
  progress: 50,
  message: '已完成一半'
});
```

## CLI 命令

```bash
# 初始化节点
npm run init

# 启动节点
npm start

# 查看状态
npm run status

# 创建任务
npm run task -- --title "翻译" --budget 50 --skills translation

# 启动 API 服务器
npm run api
```

## 配置

### 环境变量

```bash
# 节点配置
PORT=3000
BOOTSTRAP_NODES=/ip4/.../tcp/...

# 通知
EMAIL_SMTP=smtp.gmail.com
EMAIL_USER=your@email.com
EMAIL_PASS=password

# 区块链
ETH_RPC_URL=https://rpc.sepolia.org
PRIVATE_KEY=0x...

# Gitcoin Passport (可选)
GITCOIN_API_KEY=your_api_key
```

## 示例项目

见 [examples/](examples/) 目录。

## 类型定义

完整的 TypeScript 类型定义见 [types/](types/) 目录。
