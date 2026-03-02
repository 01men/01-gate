/**
 * 01门 - 完整主入口
 * 去中心化微任务网络 - 整合所有模块
 */

const { Identity } = require('./identity/Identity');
const { Authorization } = require('./identity/Authorization');
const { Task, TaskStatus, BroadcastSchedule } = require('./task/Task');
const { MatchEngine } = require('./task/MatchEngine');
const { BroadcastScheduler } = require('./task/BroadcastScheduler');
const { P2PNode } = require('./p2p/Node');
const { P2PNetwork, KademliaRouter, GossipProtocol } = require('./p2p/Network');
const { VRF, NodeSelector } = require('./p2p/VRF');
const { SettlementService, StateChannel } = require('./settlement/Settlement');
const { ReputationOracle, REPUTATION } = require('./core/Reputation');
const { ArbitrationService } = require('./core/Arbitration');
const { KlerosArbitration, DisputeManager } = require('./core/Kleros');
const { NotificationService } = require('./core/NotificationService');
const { TEEProof, CreditCalculator, CreditService } = require('./core/Credit');
const { MonitoringService, MetricsCollector } = require('./core/Monitoring');
const { PrivacyService, LocalDifferentialPrivacy } = require('./core/Privacy');
const { SecurityFramework, SecurityEvent } = require('./core/Security');
const { CommunicationService, MessageType } = require('./core/Communication');
const { ProofOfPersonhood, VerificationLevel } = require('./core/ProofOfPersonhood');
const { TokenEconomics, DynamicVesting, FeeMechanism, UtilityStaking } = require('./core/Economics');
const { PaymentGateway, PaymentService, PaymentMethod, SupportedTokens } = require('./core/Payment');
const { MobileClientFactory, IOSClient, AndroidClient, LightObserver } = require('./mobile/MobileClient');
const { APIAdapter, Gate01SDK, OneClickAdapter, quickStart } = require('./adapter/APIAdapter');

class Gate01 {
  constructor(options = {}) {
    this.identity = options.identity || null;
    this.p2pNode = null;
    this.vrf = null;
    this.nodeSelector = null;
    this.settlement = new SettlementService();
    this.reputation = new ReputationOracle();
    this.arbitration = new ArbitrationService();
    this.matchEngine = null;
    this.notification = new NotificationService();
    this.tasks = new Map();
    
    // 配置
    this.config = {
      port: options.port || 0,
      bootstrapNodes: options.bootstrapNodes || [],
      role: options.role || 'agent', // 'agent' | 'human'
      isAutoAccept: options.isAutoAccept || false,
      email: options.email || null,
      heartbeatInterval: options.heartbeatInterval || 900000, // 15分钟
      ...options
    };
    
    // 状态
    this.isRunning = false;
    this.lastHeartbeat = null;
  }

  /**
   * 初始化
   */
  async initialize() {
    console.log('========================================');
    console.log('  01门 - 去中心化微任务网络');
    console.log('========================================\n');
    
    // 加载或生成身份
    await this._initIdentity();
    
    // 初始化VRF
    this.vrf = new VRF(this.identity.privateKey, this.identity.publicKey);
    this.nodeSelector = new NodeSelector(this.vrf, { k: 1000 });
    
    // 初始化匹配引擎
    this.matchEngine = new MatchEngine({
      reputation: this.reputation,
      vrf: this.vrf
    });
    
    // 初始化P2P节点
    await this._initP2P();
    
    // 加载任务
    await this._loadTasks();
    
    // 启动心跳
    this._startHeartbeat();
    
    this.isRunning = true;
    console.log('\n[01门] 初始化完成，准备就绪\n');
    
    return this;
  }

  /**
   * 初始化身份
   */
  async _initIdentity() {
    const fs = require('fs');
    const path = require('path');
    const dataDir = './01-gate/data';
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const identityPath = path.join(dataDir, 'identity.json');
    this.identity = Identity.load(identityPath);
    
    if (!this.identity) {
      console.log('[01门] 生成新身份...');
      this.identity = Identity.generate();
      this.identity.save(identityPath);
    }
    
    console.log(`[01门] DID: ${this.identity.did}`);
    console.log(`[01门] 地址: ${this.identity.address}`);
    
    // 初始化信誉记录
    const rep = this.reputation.getOrCreate(this.identity.did);
    console.log(`[01门] 信誉分: ${rep.score}`);
  }

  /**
   * 初始化P2P
   */
  async _initP2P() {
    console.log('[01门] 初始化P2P网络...');
    
    this.p2pNode = new P2PNode({
      port: this.config.port,
      bootstrapNodes: this.config.bootstrapNodes,
      onTaskBroadcast: this._handleTaskBroadcast.bind(this),
      onTaskAccept: this._handleTaskAccept.bind(this),
      onMessage: this._handleMessage.bind(this)
    });
    
    await this.p2pNode.start();
    
    // 订阅任务主题
    await this.p2pNode.subscribeToTasks((task, from) => {
      this._onIncomingTask(task, from);
    });
  }

  /**
   * 加载任务
   */
  async _loadTasks() {
    const fs = require('fs');
    const path = require('path');
    const tasksFile = path.join('./01-gate/data', 'tasks.json');
    
    try {
      if (fs.existsSync(tasksFile)) {
        const data = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
        for (const taskData of data) {
          this.tasks.set(taskData.id, new Task(taskData));
        }
        console.log(`[01门] 已加载 ${this.tasks.size} 个任务`);
      }
    } catch (e) {
      console.warn('[01门] 加载任务失败:', e.message);
    }
  }

  /**
   * 保存任务
   */
  async _saveTasks() {
    const fs = require('fs');
    const path = require('path');
    const dataDir = path.join('./01-gate/data');
    const tasksFile = path.join(dataDir, 'tasks.json');
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const tasks = Array.from(this.tasks.values()).map(t => t.toJSON());
    fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));
  }

  /**
   * 启动心跳
   */
  _startHeartbeat() {
    console.log(`[01门] 心跳间隔: ${this.config.heartbeatInterval / 1000 / 60} 分钟`);
    
    setInterval(async () => {
      await this.heartbeat();
    }, this.config.heartbeatInterval);
  }

  /**
   * 心跳
   */
  async heartbeat() {
    console.log(`[01门] Heartbeat: ${new Date().toISOString()}`);
    this.lastHeartbeat = Date.now();
    
    // TODO: 发送心跳到网络
    // TODO: 检查新任务
  }

  /**
   * 创建任务
   */
  async createTask(options) {
    const task = new Task({
      ...options,
      requester: this.identity.did
    });
    
    this.tasks.set(task.id, task);
    await this._saveTasks();
    
    // 初始化匹配
    const matchResult = await this.matchEngine.initializeTask(task);
    task.metadata.matchResult = matchResult;
    
    // 广播任务
    await this._broadcastTask(task);
    
    console.log(`[01门] ✅ 任务已创建: ${task.id}`);
    console.log(`[01门]    标题: ${task.title}`);
    console.log(`[01门]    预算: ${task.budget} ${task.token}`);
    console.log(`[01门]    技能: ${(task.skills || []).join(', ')}`);
    
    // 通知
    if (this.config.email) {
      await this.notification.notifyNewTask(this.config.email, task);
    }
    
    return task;
  }

  /**
   * 广播任务
   */
  async _broadcastTask(task) {
    task.broadcast();
    await this.p2pNode.broadcastTask(task.toJSON());
  }

  /**
   * 承接任务
   */
  async acceptTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error('任务不存在');
    }
    
    if (!task.canTransition(TaskStatus.ACCEPTED)) {
      throw new Error('任务当前不可承接');
    }
    
    // 验证信誉
    if (this.reputation.isFlagged(this.identity.did)) {
      throw new Error('账户被标记为风险');
    }
    
    task.accept(this.identity.did);
    await this._saveTasks();
    
    // 开启结算通道
    await this.settlement.openChannel(
      task.requester,
      this.identity.did,
      task.budget,
      task.token
    );
    
    console.log(`[01门] ✅ 已承接任务: ${taskId}`);
    
    return task;
  }

  /**
   * 提交交付物
   */
  async submitTask(taskId, delivery) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error('任务不存在');
    }
    
    task.submit(delivery);
    await this._saveTasks();
    
    console.log(`[01门] ✅ 已提交任务: ${taskId}`);
    
    // 通知需求方
    if (this.config.email) {
      await this.notification.notifyTaskCompleted(this.config.email, task);
    }
    
    return task;
  }

  /**
   * 验收任务
   */
  async approveTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error('任务不存在');
    }
    
    task.approve();
    await this._saveTasks();
    
    // 更新信誉
    this.reputation.onTaskComplete(task.acceptor, task.budget);
    
    // 结算
    await this.settlement.closeChannel(
      task.id,
      { requester: 0, acceptor: task.budget }
    );
    
    console.log(`[01门] ✅ 任务已完成: ${taskId}`);
    
    return task;
  }

  /**
   * 发起争议
   */
  async disputeTask(taskId, reason) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error('任务不存在');
    }
    
    task.dispute(reason);
    await this._saveTasks();
    
    // 创建仲裁案件
    const arbitrationCase = await this.arbitration.createCase(
      task,
      this.identity.did,
      reason
    );
    
    console.log(`[01门] ⚠️ 已发起争议: ${taskId}`);
    console.log(`[01门]    仲裁ID: ${arbitrationCase.id}`);
    
    return arbitrationCase;
  }

  /**
   * 处理任务广播
   */
  async _handleTaskBroadcast(taskData) {
    console.log(`[01门] 收到新任务: ${taskData.title}`);
    
    if (this.tasks.has(taskData.id)) {
      return;
    }
    
    // 评估任务
    const evaluation = this.matchEngine.evaluateNode(this.identity.did, taskData);
    console.log(`[01门]    匹配度: ${(evaluation.totalScore * 100).toFixed(1)}%`);
    
    // 自动承接或通知
    if (this.config.isAutoAccept && evaluation.totalScore > 0.5) {
      await this.acceptTask(taskData.id);
    } else if (this.config.email) {
      await this.notification.notifyNewTask(this.config.email, new Task(taskData));
    }
  }

  /**
   * 处理任务承接
   */
  async _handleTaskAccept(taskId, acceptorDID) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    
    if (task.canTransition(TaskStatus.ACCEPTED)) {
      task.accept(acceptorDID);
      await this._saveTasks();
      console.log(`[01门] 任务被承接: ${taskId} by ${acceptorDID}`);
    }
  }

  /**
   * 处理消息
   */
  async _handleMessage(message) {
    console.log(`[01门] 收到消息: ${message.type}`);
  }

  /**
   * 获取任务列表
   */
  getTasks(filter = {}) {
    let tasks = Array.from(this.tasks.values());
    
    if (filter.status) {
      tasks = tasks.filter(t => t.status === filter.status);
    }
    
    if (filter.requester) {
      tasks = tasks.filter(t => t.requester === filter.requester);
    }
    
    return tasks;
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      running: this.isRunning,
      did: this.identity?.did,
      address: this.identity?.address,
      reputation: this.reputation.getScore(this.identity?.did),
      taskCount: this.tasks.size,
      lastHeartbeat: this.lastHeartbeat,
      p2pPeers: this.p2pNode ? this.p2pNode.getPeers().length : 0
    };
  }

  /**
   * 停止节点
   */
  async stop() {
    this.isRunning = false;
    
    if (this.p2pNode) {
      await this.p2pNode.stop();
    }
    
    console.log('[01门] 节点已停止');
  }
}

// 导出
module.exports = { 
  Gate01,
  // Identity
  Identity,
  Authorization,
  // Task
  Task,
  TaskStatus,
  BroadcastSchedule,
  MatchEngine,
  BroadcastScheduler,
  // P2P
  P2PNode,
  P2PNetwork,
  KademliaRouter,
  GossipProtocol,
  VRF,
  NodeSelector,
  // Settlement
  SettlementService,
  StateChannel,
  // Core
  ReputationOracle,
  REPUTATION,
  ArbitrationService,
  KlerosArbitration,
  DisputeManager,
  NotificationService,
  TEEProof,
  CreditCalculator,
  CreditService,
  // Monitoring
  MonitoringService,
  MetricsCollector,
  // Privacy
  PrivacyService,
  LocalDifferentialPrivacy,
  // Security
  SecurityFramework,
  SecurityEvent,
  // Communication
  CommunicationService,
  MessageType,
  // Proof of Personhood
  ProofOfPersonhood,
  VerificationLevel,
  // Economics
  TokenEconomics,
  DynamicVesting,
  FeeMechanism,
  UtilityStaking,
  // Payment
  PaymentGateway,
  PaymentService,
  PaymentMethod,
  SupportedTokens,
  // Mobile
  MobileClientFactory,
  IOSClient,
  AndroidClient,
  LightObserver,
  // Adapter
  APIAdapter,
  Gate01SDK,
  OneClickAdapter,
  quickStart
};

// CLI运行
if (require.main === module) {
  const args = process.argv.slice(2);
  
  (async () => {
    const gate = new Gate01({
      port: 0,
      role: 'agent',
      isAutoAccept: false,
      email: args.includes('--email') ? args[args.indexOf('--email') + 1] : null
    });
    
    await gate.initialize();
    
    // 示例：创建测试任务
    if (args.includes('--create-task')) {
      await gate.createTask({
        title: '测试任务 - 文档翻译',
        description: '翻译一篇英文技术文档到中文',
        budget: 50,
        token: 'USDC',
        skills: ['translation', 'english', 'chinese'],
        deadline: Date.now() + 7 * 24 * 60 * 60 * 1000
      });
    }
    
    // 显示状态
    console.log('\n[01门] 状态:', gate.getStatus());
    
    // 优雅退出
    process.on('SIGINT', async () => {
      await gate.stop();
      process.exit(0);
    });
  })();
}
