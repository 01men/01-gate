/**
 * 01门 - Kleros 仲裁集成
 * 去中心化争议解决
 */

const crypto = require('crypto');

/**
 * Kleros 案件
 */
class KlerosCase {
  constructor(options = {}) {
    this.caseId = options.caseId || `case_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.taskId = options.taskId;
    this.requester = options.requester;
    this.acceptor = options.acceptor;
    this.amount = options.amount;
    this.token = options.token || 'USDC';
    this.description = options.description;
    this.evidence = options.evidence || [];
    this.status = options.status || 'open'; // open, appealed, resolved
    this.ruling = options.ruling || null; // requester, acceptor, split
    this.createdAt = options.createdAt || Date.now();
    this.appealPeriod = options.appealPeriod || 48 * 60 * 60 * 1000; // 48小时
    this.deadline = options.deadline || (Date.now() + this.appealPeriod);
  }

  /**
   * 添加证据
   */
  addEvidence(submitter, evidence) {
    this.evidence.push({
      submitter,
      evidence,
      timestamp: Date.now(),
      hash: crypto.createHash('sha256').update(evidence).digest('hex')
    });
    return this;
  }

  /**
   * 检查是否在申诉期内
   */
  isWithinAppealPeriod() {
    return Date.now() < this.deadline;
  }

  toJSON() {
    return {
      caseId: this.caseId,
      taskId: this.taskId,
      requester: this.requester,
      acceptor: this.acceptor,
      amount: this.amount,
      token: this.token,
      description: this.description,
      evidence: this.evidence,
      status: this.status,
      ruling: this.ruling,
      createdAt: this.createdAt,
      deadline: this.deadline
    };
  }
}

/**
 * Kleros 仲裁服务
 */
class KlerosArbitration {
  constructor(options = {}) {
    this.cases = new Map();
    this.courtId = options.courtId || 0; // Kleros 法庭ID
    this.minStake = options.minStake || 100; // 最小质押
    this.fee = options.fee || 0.005; // 仲裁费用 (0.5%)

    // Kleros 合约接口
    this.klerosContract = options.klerosContract || null;
  }

  /**
   * 提交到 Kleros
   */
  async submitDispute(caseData) {
    const klerosCase = new KlerosCase(caseData);
    this.cases.set(klerosCase.caseId, klerosCase);

    console.log(`[Kleros] Dispute submitted: ${klerosCase.caseId}`);
    console.log(`[Kleros] Amount: ${klerosCase.amount} ${klerosCase.token}`);
    console.log(`[Kleros] Appeal deadline: ${new Date(klerosCase.deadline).toISOString()}`);

    // 模拟提交到 Kleros 智能合约
    if (this.klerosContract) {
      // await this.klerosContract.createDispute(...)
    }

    return {
      caseId: klerosCase.caseId,
      disputeID: `0x${Math.random().toString(16).slice(2)}`,
      fee: klerosCase.amount * this.fee,
      deadline: klerosCase.deadline
    };
  }

  /**
   * 提交证据
   */
  async submitEvidence(caseId, submitter, evidence) {
    const klerosCase = this.cases.get(caseId);
    if (!klerosCase) {
      throw new Error('Case not found');
    }

    klerosCase.addEvidence(submitter, evidence);
    console.log(`[Kleros] Evidence submitted to ${caseId} by ${submitter}`);

    return { success: true, evidenceCount: klerosCase.evidence.length };
  }

  /**
   * 上诉
   */
  async appeal(caseId, appellant, reason) {
    const klerosCase = this.cases.get(caseId);
    if (!klerosCase) {
      throw new Error('Case not found');
    }

    if (!klerosCase.isWithinAppealPeriod()) {
      throw new Error('Appeal period expired');
    }

    // 上诉费用通常是初始费用的倍数
    const appealFee = klerosCase.amount * this.fee * 3;

    klerosCase.status = 'appealed';
    klerosCase.appeal = {
      appellant,
      reason,
      fee: appealFee,
      timestamp: Date.now()
    };

    // 延长处理时间
    klerosCase.deadline = Date.now() + (48 * 60 * 60 * 1000);

    console.log(`[Kleros] Case ${caseId} appealed by ${appellant}, fee: ${appealFee}`);

    return {
      success: true,
      appealFee,
      newDeadline: klerosCase.deadline
    };
  }

  /**
   * 执行裁决
   */
  async executeRuling(caseId, ruling) {
    const klerosCase = this.cases.get(caseId);
    if (!klerosCase) {
      throw new Error('Case not found');
    }

    klerosCase.status = 'resolved';
    klerosCase.ruling = ruling;

    // 计算分配
    let requesterAmount, acceptorAmount;

    if (ruling === 'requester') {
      requesterAmount = klerosCase.amount;
      acceptorAmount = 0;
    } else if (ruling === 'acceptor') {
      requesterAmount = 0;
      acceptorAmount = klerosCase.amount;
    } else { // split
      requesterAmount = klerosCase.amount / 2;
      acceptorAmount = klerosCase.amount / 2;
    }

    console.log(`[Kleros] Ruling executed: ${ruling}`);
    console.log(`[Kleros] Requester: ${requesterAmount}, Acceptor: ${acceptorAmount}`);

    return {
      caseId,
      ruling,
      requesterAmount,
      acceptorAmount,
      resolvedAt: Date.now()
    };
  }

  /**
   * 获取案件列表
   */
  getCases(filter = {}) {
    let cases = Array.from(this.cases.values());

    if (filter.status) {
      cases = cases.filter(c => c.status === filter.status);
    }

    return cases;
  }

  /**
   * 获取案件详情
   */
  getCase(caseId) {
    return this.cases.get(caseId);
  }
}

/**
 * 争议管理器
 */
class DisputeManager {
  constructor(options = {}) {
    this.localArbitration = new KlerosArbitration(options);
    this.klerosIntegration = options.klerosIntegration || false;
  }

  /**
   * 创建争议
   */
  async createDispute(task, disputer, reason) {
    const caseData = {
      taskId: task.id,
      requester: task.requester,
      acceptor: task.acceptor,
      amount: task.budget,
      token: task.token,
      description: reason
    };

    if (this.klerosIntegration) {
      return await this.localArbitration.submitDispute(caseData);
    } else {
      // 本地仲裁
      const { ArbitrationService } = require('./Arbitration');
      const arbitration = new ArbitrationService();
      return await arbitration.createCase(task, disputer, reason);
    }
  }
}

module.exports = { KlerosCase, KlerosArbitration, DisputeManager };
