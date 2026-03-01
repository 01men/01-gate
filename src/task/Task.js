/**
 * 01门 - 任务生命周期状态机
 */

const { v4: uuidv4 } = require('uuid');

const TaskStatus = {
  // 初始状态
  PENDING: 'pending',           // 等待广播
  
  // 广播阶段
  BROADCASTING: 'broadcasting', // 广播中
  BROADCAST_RETRY: 'broadcast_retry', // 广播重试中
  
  // 承接阶段
  ACCEPTED: 'accepted',         // 已承接
  IN_PROGRESS: 'in_progress',  // 执行中
  
  // 交付阶段
  SUBMITTED: 'submitted',       // 已提交
  UNDER_REVIEW: 'under_review', // 验收中
  
  // 终结状态
  COMPLETED: 'completed',      // 已完成
  CANCELLED: 'cancelled',      // 已取消
  
  // 争议状态
  DISPUTED: 'disputed',       // 争议中
  ARBITRATION: 'arbitration', // 仲裁中
  
  // 失败状态
  BROADCAST_FAILED: 'broadcast_failed', // 广播失败
  EXPIRED: 'expired'          // 已过期
};

// 状态转换规则
const StateTransitions = {
  [TaskStatus.PENDING]: [TaskStatus.BROADCASTING],
  [TaskStatus.BROADCASTING]: [TaskStatus.ACCEPTED, TaskStatus.BROADCAST_RETRY, TaskStatus.BROADCAST_FAILED],
  [TaskStatus.BROADCAST_RETRY]: [TaskStatus.ACCEPTED, TaskStatus.BROADCAST_RETRY, TaskStatus.BROADCAST_FAILED],
  [TaskStatus.ACCEPTED]: [TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.SUBMITTED, TaskStatus.CANCELLED],
  [TaskStatus.SUBMITTED]: [TaskStatus.UNDER_REVIEW, TaskStatus.DISPUTED],
  [TaskStatus.UNDER_REVIEW]: [TaskStatus.COMPLETED, TaskStatus.DISPUTED],
  [TaskStatus.DISPUTED]: [TaskStatus.ARBITRATION, TaskStatus.COMPLETED, TaskStatus.CANCELLED],
  [TaskStatus.ARBITRATION]: [TaskStatus.COMPLETED, TaskStatus.CANCELLED],
  [TaskStatus.COMPLETED]: [],
  [TaskStatus.CANCELLED]: [],
  [TaskStatus.BROADCAST_FAILED]: [TaskStatus.PENDING], // 可以重试
  [TaskStatus.EXPIRED]: []
};

class Task {
  constructor(options = {}) {
    this.id = options.id || uuidv4();
    this.title = options.title;
    this.description = options.description;
    this.requester = options.requester; // DID
    this.budget = options.budget; // 代币数量
    this.token = options.token || 'USDC'; // 代币类型
    this.skills = options.skills || []; // 技能要求
    this.deadline = options.deadline; // Unix timestamp
    this.status = options.status || TaskStatus.PENDING;
    this.acceptor = options.acceptor || null; // 承接方DID
    this.submission = options.submission || null;
    this.delivery = options.delivery || null;
    this.metadata = options.metadata || {};
    this.createdAt = options.createdAt || Date.now();
    this.updatedAt = options.updatedAt || Date.now();
    
    // 广播相关
    this.broadcastCount = options.broadcastCount || 0;
    this.broadcastHistory = options.broadcastHistory || [];
    
    // 争议相关
    this.disputeReason = options.disputeReason || null;
    this.arbitrationResult = options.arbitrationResult || null;
  }

  /**
   * 状态转换
   */
  transition(newStatus) {
    const allowed = StateTransitions[this.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Invalid transition from ${this.status} to ${newStatus}`);
    }
    this.status = newStatus;
    this.updatedAt = Date.now();
    return this;
  }

  /**
   * 检查是否可以转换状态
   */
  canTransition(newStatus) {
    const allowed = StateTransitions[this.status] || [];
    return allowed.includes(newStatus);
  }

  /**
   * 广播任务
   */
  broadcast() {
    if (this.status !== TaskStatus.PENDING && 
        this.status !== TaskStatus.BROADCAST_RETRY &&
        this.status !== TaskStatus.BROADCAST_FAILED) {
      throw new Error(`Cannot broadcast task in status: ${this.status}`);
    }
    
    this.broadcastCount++;
    this.status = TaskStatus.BROADCASTING;
    this.broadcastHistory.push({
      timestamp: Date.now(),
      count: this.broadcastCount
    });
    this.updatedAt = Date.now();
    return this;
  }

  /**
   * 承接任务
   */
  accept(acceptorDID) {
    this.transition(TaskStatus.ACCEPTED);
    this.acceptor = acceptorDID;
    return this;
  }

  /**
   * 提交交付物
   */
  submit(delivery) {
    this.transition(TaskStatus.SUBMITTED);
    this.delivery = delivery;
    return this;
  }

  /**
   * 验收通过
   */
  approve() {
    this.transition(TaskStatus.COMPLETED);
    return this;
  }

  /**
   * 发起争议
   */
  dispute(reason) {
    this.transition(TaskStatus.DISPUTED);
    this.disputeReason = reason;
    return this;
  }

  /**
   * 转换为JSON
   */
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      requester: this.requester,
      budget: this.budget,
      token: this.token,
      skills: this.skills,
      deadline: this.deadline,
      status: this.status,
      acceptor: this.acceptor,
      submission: this.submission,
      delivery: this.delivery,
      metadata: this.metadata,
      broadcastCount: this.broadcastCount,
      broadcastHistory: this.broadcastHistory,
      disputeReason: this.disputeReason,
      arbitrationResult: this.arbitrationResult,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * 获取下次广播延迟（小时）
   */
  getNextBroadcastDelay() {
    const n = Math.min(this.broadcastCount, 5);
    return 3 * (n + 6); // 3 * (N + 6) 小时
  }
}

// 广播间隔表
const BroadcastSchedule = [
  0,    // 第1次：立即
  21,   // 第2次：3*(1+6)=21小时后
  24,   // 第3次：3*(2+6)=24小时后
  27,   // 第4次
  33,   // 第5次：3*(5+6)=33小时后
];

module.exports = { Task, TaskStatus, BroadcastSchedule };
