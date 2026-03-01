/**
 * 01门 - 信誉系统
 * 混合式信誉体系：链上 + 链下
 */

const crypto = require('crypto');

/**
 * 信誉分计算
 */
const REPUTATION = {
  // 初始分
  INITIAL: 100,
  
  // 任务完成
  TASK_COMPLETE: 10,
  TASK_COMPLETE_BONUS: 5, // 高价值任务额外
  
  // 任务失败/取消
  TASK_CANCEL: -5,
  TASK_FAIL: -10,
  
  // 争议
  DISPUTE_LOST: -20,
  DISPUTE_WIN: 5,
  
  // 支付违约
  PAYMENT_DEFAULT: -100, // 永久标记
  
  // 信誉加速器
  GENESIS_BONUS: 1.5, // 创世贡献者
  REFERRAL_BONUS: 1.2, // 推荐
};

/**
 * 信誉记录
 */
class ReputationRecord {
  constructor(options = {}) {
    this.did = options.did;
    this.score = options.score || REPUTATION.INITIAL;
    this.history = options.history || [];
    this.flags = options.flags || []; // 风险标记
    this.skills = options.skills || []; // 技能标签
    this.totalTasks = options.totalTasks || 0;
    this.completedTasks = options.completedTasks || 0;
    this.failedTasks = options.failedTasks || 0;
    this.createdAt = options.createdAt || Date.now();
    this.updatedAt = options.updatedAt || Date.now();
  }

  /**
   * 更新信誉分
   */
  updateScore(delta, reason) {
    this.score = Math.max(0, this.score + delta);
    this.history.push({
      delta,
      reason,
      timestamp: Date.now(),
      newScore: this.score
    });
    this.updatedAt = Date.now();
    return this;
  }

  /**
   * 完成任务
   */
  completeTask(budget) {
    this.totalTasks++;
    this.completedTasks++;
    
    let delta = REPUTATION.TASK_COMPLETE;
    if (budget > 100) delta += REPUTATION.TASK_COMPLETE_BONUS;
    
    return this.updateScore(delta, 'Task completed');
  }

  /**
   * 任务失败
   */
  failTask() {
    this.totalTasks++;
    this.failedTasks++;
    return this.updateScore(REPUTATION.TASK_FAIL, 'Task failed');
  }

  /**
   * 任务取消
   */
  cancelTask() {
    this.totalTasks++;
    return this.updateScore(REPUTATION.TASK_CANCEL, 'Task cancelled');
  }

  /**
   * 标记风险账户
   */
  flag(reason) {
    this.flags.push({
      reason,
      timestamp: Date.now()
    });
    this.updateScore(REPUTATION.PAYMENT_DEFAULT, `Flagged: ${reason}`);
    return this;
  }

  /**
   * 添加技能
   */
  addSkill(skill) {
    if (!this.skills.includes(skill)) {
      this.skills.push(skill);
    }
    return this;
  }

  /**
   * 获取完成率
   */
  getCompletionRate() {
    if (this.totalTasks === 0) return 0;
    return this.completedTasks / this.totalTasks;
  }

  /**
   * 转换为JSON
   */
  toJSON() {
    return {
      did: this.did,
      score: this.score,
      history: this.history,
      flags: this.flags,
      skills: this.skills,
      totalTasks: this.totalTasks,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
      completionRate: this.getCompletionRate(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * 信誉预言机
 * 计算并更新节点信誉
 */
class ReputationOracle {
  constructor(options = {}) {
    this.records = new Map(); // did -> ReputationRecord
    this.storagePath = options.storagePath || './data/reputation';
    this.load();
  }

  /**
   * 加载信誉数据
   */
  load() {
    const fs = require('fs');
    const path = require('path');
    
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        for (const [did, record] of Object.entries(data)) {
          this.records.set(did, new ReputationRecord(record));
        }
      }
    } catch (e) {
      console.warn('[Reputation] Load failed:', e.message);
    }
  }

  /**
   * 保存信誉数据
   */
  save() {
    const fs = require('fs');
    const path = require('path');
    
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const data = {};
      for (const [did, record] of this.records) {
        data[did] = record.toJSON();
      }
      
      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[Reputation] Save failed:', e.message);
    }
  }

  /**
   * 获取或创建信誉记录
   */
  getOrCreate(did) {
    if (!this.records.has(did)) {
      this.records.set(did, new ReputationRecord({ did }));
    }
    return this.records.get(did);
  }

  /**
   * 获取信誉
   */
  getScore(did) {
    const record = this.records.get(did);
    return record ? record.score : REPUTATION.INITIAL;
  }

  /**
   * 检查是否被标记
   */
  isFlagged(did) {
    const record = this.records.get(did);
    return record ? record.flags.length > 0 : false;
  }

  /**
   * 更新任务完成
   */
  onTaskComplete(did, budget) {
    const record = this.getOrCreate(did);
    record.completeTask(budget);
    this.save();
  }

  /**
   * 更新任务失败
   */
  onTaskFail(did) {
    const record = this.getOrCreate(did);
    record.failTask();
    this.save();
  }

  /**
   * 标记支付违约
   */
  onPaymentDefault(did, reason) {
    const record = this.getOrCreate(did);
    record.flag(reason);
    this.save();
  }

  /**
   * 搜索技能匹配
   */
  findBySkills(requiredSkills, minScore = 0) {
    const results = [];
    
    for (const [did, record] of this.records) {
      if (record.score < minScore) continue;
      if (record.flags.length > 0) continue; // 排除风险账户
      
      const matchingSkills = record.skills.filter(s => 
        requiredSkills.includes(s)
      );
      
      if (matchingSkills.length > 0) {
        results.push({
          did,
          score: record.score,
          matchingSkills,
          completionRate: record.getCompletionRate()
        });
      }
    }
    
    // 按信誉分排序
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * 获取排名
   */
  getLeaderboard(limit = 100) {
    const all = Array.from(this.records.values())
      .filter(r => r.flags.length === 0) // 排除被标记的
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
    return all.map((r, i) => ({
      rank: i + 1,
      did: r.did,
      score: r.score,
      tasksCompleted: r.completedTasks,
      completionRate: r.getCompletionRate()
    }));
  }
}

/**
 * 可验证凭证 (VC)
 */
class VerifiableCredential {
  constructor(options = {}) {
    this.id = options.id || `vc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    this.issuer = options.issuer;
    this.subject = options.subject;
    this.claim = options.claim;
    this.proof = options.proof || null;
    this.createdAt = options.createdAt || Date.now();
    this.expiresAt = options.expiresAt || null;
  }

  /**
   * 签名
   */
  async sign(issuerPrivateKey) {
    const data = JSON.stringify({
      iss: this.issuer,
      sub: this.subject,
      claim: this.claim,
      iat: this.createdAt,
      exp: this.expiresAt
    });
    
    const { ethers } = require('ethers');
    
    const wallet = new ethers.Wallet(issuerPrivateKey);
    this.proof = await wallet.signMessage(data);
    
    return this;
  }

  /**
   * 验证
   */
  verify() {
    if (!this.proof) return false;
    
    const data = JSON.stringify({
      iss: this.issuer,
      sub: this.subject,
      claim: this.claim,
      iat: this.createdAt,
      exp: this.expiresAt
    });
    
    try {
      const { ethers } = require('ethers');
      const recovered = ethers.verifyMessage(data, this.proof);
      return recovered.toLowerCase() === this.issuer.toLowerCase();
    } catch (e) {
      return false;
    }
  }

  toJSON() {
    return {
      id: this.id,
      issuer: this.issuer,
      subject: this.subject,
      claim: this.claim,
      proof: this.proof,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt
    };
  }
}

module.exports = { 
  ReputationRecord, 
  ReputationOracle, 
  REPUTATION,
  VerifiableCredential 
};
