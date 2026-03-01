/**
 * 01门 - 仲裁模块
 * 基于Kleros的去中心化仲裁
 */

const crypto = require('crypto');

/**
 * 仲裁状态
 */
const ArbitrationStatus = {
  PENDING: 'pending',           // 待仲裁
  VOTING: 'voting',            // 投票中
  REVEALED: 'revealed',        // 公示中
  CONCLUDED: 'concluded',       // 已结束
  EXECUTED: 'executed'         // 已执行
};

/**
 * 仲裁案件
 */
class ArbitrationCase {
  constructor(options = {}) {
    this.id = options.id || `arb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.taskId = options.taskId;
    this.requester = options.requester;
    this.acceptor = options.acceptor;
    this.disputer = options.disputer; // 发起争议方
    this.reason = options.reason;
    this.evidence = options.evidence || []; // 证据列表
    this.status = options.status || ArbitrationStatus.PENDING;
    this.votes = options.votes || { requester: [], acceptor: [] };
    this.result = options.result || null;
    this.createdAt = options.createdAt || Date.now();
    this.deadline = options.deadline || (Date.now() + 48 * 60 * 60 * 1000); // 48小时
  }

  /**
   * 添加证据
   */
  addEvidence(evidence) {
    this.evidence.push({
      ...evidence,
      timestamp: Date.now()
    });
    return this;
  }

  /**
   * 提交投票
   */
  submitVote(voter, decision, reasoning, stake) {
    // decision: 'requester' | 'acceptor'
    this.votes[decision].push({
      voter,
      reasoning,
      stake,
      timestamp: Date.now()
    });
    return this;
  }

  /**
   * 结束仲裁
   */
  conclude() {
    this.status = ArbitrationStatus.CONCLUDED;
    
    // 统计投票
    const requesterVotes = this.votes.requester.length;
    const acceptorVotes = this.votes.acceptor.length;
    
    // 简单多数决
    if (requesterVotes > acceptorVotes) {
      this.result = {
        winner: 'requester',
        requesterVotes,
        acceptorVotes,
        amountToAcceptor: 0,
        amountToRequester: 1.0 // 全部退回
      };
    } else if (acceptorVotes > requesterVotes) {
      this.result = {
        winner: 'acceptor',
        requesterVotes,
        acceptorVotes,
        amountToAcceptor: 1.0,
        amountToRequester: 0
      };
    } else {
      // 平局 - 各得一半
      this.result = {
        winner: 'tie',
        requesterVotes,
        acceptorVotes,
        amountToAcceptor: 0.5,
        amountToRequester: 0.5
      };
    }
    
    return this;
  }

  toJSON() {
    return {
      id: this.id,
      taskId: this.taskId,
      requester: this.requester,
      acceptor: this.acceptor,
      disputer: this.disputer,
      reason: this.reason,
      evidence: this.evidence,
      status: this.status,
      votes: this.votes,
      result: this.result,
      createdAt: this.createdAt,
      deadline: this.deadline
    };
  }
}

/**
 * 仲裁服务
 */
class ArbitrationService {
  constructor(options = {}) {
    this.cases = new Map();
    this.klerosContract = options.klerosContract || null;
    this.juryPool = options.juryPool || [];
    
    // 配置
    this.config = {
      jurySize: 3,           // 陪审团人数
      voteStake: 100,        // 投票 stake 数量
      voteReward: 50,        // 正确投票奖励
      votePenalty: 25,       // 错误投票罚款
      reasoningWeight: 0.3,   // 理由权重 (LQC)
      appealPeriod: 24 * 60 * 60 * 1000 // 24小时申诉期
    };
  }

  /**
   * 创建仲裁案件
   */
  async createCase(task, disputer, reason) {
    const arbitrationCase = new ArbitrationCase({
      taskId: task.id,
      requester: task.requester,
      acceptor: task.acceptor,
      disputer,
      reason
    });
    
    this.cases.set(arbitrationCase.id, arbitrationCase);
    
    console.log(`[Arbitration] Created case: ${arbitrationCase.id}`);
    
    // 触发48小时申诉窗口
    // 智能合约端会自动冻结资金
    
    return arbitrationCase;
  }

  /**
   * 提交证据
   */
  async submitEvidence(caseId, submitter, evidence) {
    const arbitrationCase = this.cases.get(caseId);
    if (!arbitrationCase) {
      throw new Error('Case not found');
    }
    
    arbitrationCase.addEvidence({
      submitter,
      content: evidence
    });
    
    return arbitrationCase;
  }

  /**
   * 选择陪审员
   */
  async selectJury(arbitrationCase) {
    // 简化：从候选池随机选择
    const shuffled = [...this.juryPool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, this.config.jurySize);
  }

  /**
   * 投票
   */
  async vote(caseId, juror, decision, reasoning) {
    const arbitrationCase = this.cases.get(caseId);
    if (!arbitrationCase) {
      throw new Error('Case not found');
    }
    
    if (arbitrationCase.status !== ArbitrationStatus.VOTING) {
      throw new Error('Voting not open');
    }
    
    arbitrationCase.submitVote(juror, decision, reasoning, this.config.voteStake);
    
    // 检查是否所有人都已投票
    const totalVotes = arbitrationCase.votes.requester.length + 
                       arbitrationCase.votes.acceptor.length;
    
    if (totalVotes >= this.config.jurySize) {
      arbitrationCase.status = ArbitrationStatus.REVEALED;
      
      // 开启公示期
      setTimeout(() => {
        this._finalizeCase(caseId);
      }, this.config.appealPeriod);
    }
    
    return arbitrationCase;
  }

  /**
   * 计算逻辑质量系数 (LQC)
   */
  calculateLQC(reasoning) {
    // 简化实现：基于理由长度和关键词
    const length = reasoning.length;
    const keywords = ['因为', '所以', '根据', '证据', '分析', 'therefore', 'because', 'evidence'];
    const keywordCount = keywords.filter(k => 
      reasoning.toLowerCase().includes(k.toLowerCase())
    ).length;
    
    // 基础分数
    let score = Math.min(length / 100, 1) * 0.5;
    score += Math.min(keywordCount / 5, 0.5);
    
    return Math.min(score, 1);
  }

  /**
   * 结算投票奖励/罚款
   */
  async _settleRewards(arbitrationCase) {
    const winner = arbitrationCase.result.winner;
    
    for (const [side, votes] of Object.entries(arbitrationCase.votes)) {
      for (const vote of votes) {
        const lqc = this.calculateLQC(vote.reasoning);
        const isCorrect = side === winner;
        
        if (isCorrect) {
          // 奖励
          const reward = this.config.voteReward * (1 + lqc);
          console.log(`[Arbitration] Rewarding ${vote.voter}: +${reward}`);
        } else {
          // 罚款
          const penalty = this.config.votePenalty * (1 - lqc);
          console.log(`[Arbitration] Penalizing ${vote.voter}: -${penalty}`);
        }
      }
    }
  }

  /**
   * 最终结案
   */
  async _finalizeCase(caseId) {
    const arbitrationCase = this.cases.get(caseId);
    if (!arbitrationCase) return;
    
    arbitrationCase.conclude();
    arbitrationCase.status = ArbitrationStatus.EXECUTED;
    
    // 结算奖励/罚款
    await this._settleRewards(arbitrationCase);
    
    // 执行资金分配
    // 实际会调用智能合约
    
    console.log(`[Arbitration] Case ${caseId} concluded: ${arbitrationCase.result.winner}`);
    
    return arbitrationCase;
  }

  /**
   * 申诉
   */
  async appeal(caseId, appellant, reason) {
    const arbitrationCase = this.cases.get(caseId);
    if (!arbitrationCase) {
      throw new Error('Case not found');
    }
    
    // 简化：仅记录申诉
    arbitrationCase.appeal = {
      appellant,
      reason,
      timestamp: Date.now()
    };
    
    // 延长处理时间
    arbitrationCase.deadline = Date.now() + this.config.appealPeriod;
    
    return arbitrationCase;
  }

  /**
   * 获取案件
   */
  getCase(caseId) {
    return this.cases.get(caseId);
  }

  /**
   * 获取所有案件
   */
  getAllCases() {
    return Array.from(this.cases.values());
  }

  /**
   * 添加陪审员到池
   */
  addJuror(juror) {
    if (!this.juryPool.includes(juror)) {
      this.juryPool.push(juror);
    }
  }
}

/**
 * 零知识证明隐私投票 (简化)
 */
class PrivacyVoting {
  constructor() {
    this.contract = null;
  }

  /**
   * 生成零知识证明
   */
  generateProof(vote, secret) {
    // 简化实现
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(vote + secret);
    return hash.digest('hex');
  }

  /**
   * 验证证明
   */
  verifyProof(vote, proof, commitment) {
    // 简化
    return true;
  }
}

module.exports = { 
  ArbitrationService, 
  ArbitrationCase, 
  ArbitrationStatus,
  PrivacyVoting 
};
