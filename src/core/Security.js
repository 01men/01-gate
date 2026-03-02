/**
 * 01门 - 安全框架
 * 多层内容拦截与意图分析
 */

const crypto = require('crypto');

// 安全拦截事件
const SecurityEvent = {
  PASSED: 'passed',
  BLOCKED: 'blocked',
  REVIEW: 'review_required'
};

// 威胁类型
const ThreatType = {
  PROMPT_INJECTION: 'prompt_injection',
  MALICIOUS_INTENT: 'malicious_intent',
  SOCIAL_ENGINEERING: 'social_engineering',
  ILLEGAL_CONTENT: 'illegal_content',
  SENSITIVE_DATA: 'sensitive_data'
};

/**
 * 边缘端语义预检
 * 轻量级本地模型快速预检
 */
class EdgeSecurityCheck {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.blockedPatterns = options.blockedPatterns || [
      /ignore\s+(previous|all|above)\s+(instructions|rules)/i,
      /system\s*prompt/i,
      /you\s+are\s+(now|a|an)\s+different/i,
      /forget\s+(everything|all|your)/i,
      /new\s+instructions/i
    ];
  }

  /**
   * 快速预检
   */
  async check(content) {
    if (!this.enabled) {
      return { event: SecurityEvent.PASSED, layer: 'edge' };
    }

    for (const pattern of this.blockedPatterns) {
      if (pattern.test(content)) {
        return {
          event: SecurityEvent.BLOCKED,
          layer: 'edge',
          reason: 'prompt_injection_detected',
          pattern: pattern.source
        };
      }
    }

    return { event: SecurityEvent.PASSED, layer: 'edge' };
  }

  /**
   * 添加自定义规则
   */
  addPattern(pattern) {
    this.blockedPatterns.push(new RegExp(pattern, 'i'));
  }
}

/**
 * TEE内深度意图分析
 * 硬件隔离环境下的深度分析
 */
class TEEIntentAnalysis {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.modelThreshold = options.threshold || 0.8;
    this.threatModel = options.threatModel || this._defaultThreatModel();
  }

  _defaultThreatModel() {
    return {
      // 恶意意图关键词
      malicious: [
        'hack', 'exploit', 'bypass', 'crack', 'steal',
        'fraud', 'scam', 'phish', 'malware', 'virus'
      ],
      // 社会工程
      socialEngineering: [
        'urgent', 'immediate', 'verify', 'confirm',
        'suspended', 'account', 'password', 'bank'
      ],
      // 非法内容
      illegal: [
        'drug', 'weapon', 'explosive', 'terrorist',
        'child abuse', 'human trafficking'
      ]
    };
  }

  /**
   * 深度意图分析
   * 生产环境需要真正的TEE和ML模型
   */
  async analyze(content, context = {}) {
    if (!this.enabled) {
      return { event: SecurityEvent.PASSED, layer: 'tee', confidence: 1.0 };
    }

    const threats = this._detectThreats(content);
    const maxThreat = this._calculateThreatScore(threats);

    if (maxThreat.score > this.modelThreshold) {
      return {
        event: SecurityEvent.BLOCKED,
        layer: 'tee',
        reason: maxThreat.type,
        confidence: maxThreat.score,
        details: threats
      };
    }

    // 边界情况 - 人工审核
    if (maxThreat.score > 0.5) {
      return {
        event: SecurityEvent.REVIEW,
        layer: 'tee',
        reason: 'suspicious_content',
        confidence: maxThreat.score,
        details: threats
      };
    }

    return { event: SecurityEvent.PASSED, layer: 'tee', confidence: 1 - maxThreat.score };
  }

  /**
   * 检测威胁
   */
  _detectThreats(content) {
    const lower = content.toLowerCase();
    const threats = {};

    for (const [type, keywords] of Object.entries(this.threatModel)) {
      let count = 0;
      for (const keyword of keywords) {
        if (lower.includes(keyword)) {
          count++;
        }
      }
      threats[type] = count / keywords.length;
    }

    return threats;
  }

  /**
   * 计算威胁分数
   */
  _calculateThreatScore(threats) {
    let maxType = null;
    let maxScore = 0;

    for (const [type, score] of Object.entries(threats)) {
      if (score > maxScore) {
        maxScore = score;
        maxType = type;
      }
    }

    return { type: maxType, score: maxScore };
  }
}

/**
 * 网络行为模式分析
 */
class NetworkBehaviorAnalysis {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.peerReputations = new Map();
    this.taskPatterns = new Map();
    this.anomalyThreshold = options.anomalyThreshold || 0.9;
  }

  /**
   * 分析网络行为
   */
  async analyze(publisherId, taskData, networkContext = {}) {
    if (!this.enabled) {
      return { event: SecurityEvent.PASSED, layer: 'network' };
    }

    const reputation = this.peerReputations.get(publisherId) || 0.5;
    const pattern = this._analyzeTaskPattern(taskData);
    const fundFlow = this._analyzeFundFlow(taskData);

    const riskScore = (1 - reputation) * 0.4 + pattern.risk * 0.3 + fundFlow.risk * 0.3;

    if (riskScore > this.anomalyThreshold) {
      return {
        event: SecurityEvent.BLOCKED,
        layer: 'network',
        reason: 'anomalous_behavior',
        riskScore
      };
    }

    if (riskScore > 0.6) {
      return {
        event: SecurityEvent.REVIEW,
        layer: 'network',
        reason: 'suspicious_pattern',
        riskScore
      };
    }

    return { event: SecurityEvent.PASSED, layer: 'network', riskScore };
  }

  /**
   * 分析任务模式
   */
  _analyzeTaskPattern(task) {
    // 异常模式检测
    const suspiciousBudget = task.budget > 10000;
    const noDeadline = !task.deadline;
    const vagueDescription = task.description && task.description.length < 20;

    const risk = (suspiciousBudget ? 0.3 : 0) + 
                 (noDeadline ? 0.2 : 0) + 
                 (vagueDescription ? 0.2 : 0);

    return { risk: Math.min(risk, 1), suspiciousBudget, noDeadline, vagueDescription };
  }

  /**
   * 分析资金流向
   */
  _analyzeFundFlow(task) {
    // 简化的资金流向分析
    const highValue = task.budget > 5000;
    const risk = highValue ? 0.3 : 0;
    return { risk };
  }

  /**
   * 更新节点信誉
   */
  updateReputation(peerId, adjustment) {
    const current = this.peerReputations.get(peerId) || 0.5;
    const updated = Math.max(0, Math.min(1, current + adjustment));
    this.peerReputations.set(peerId, updated);
    return updated;
  }
}

/**
 * 安全拦截日志
 */
class SecurityLogger {
  constructor(options = {}) {
    this.logs = [];
    this.maxLogs = options.maxLogs || 1000;
  }

  /**
   * 记录安全事件
   */
  log(event) {
    this.logs.push({
      ...event,
      timestamp: Date.now(),
      id: crypto.randomBytes(8).toString('hex')
    });

    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // 输出到控制台
    if (event.event === SecurityEvent.BLOCKED) {
      console.warn(`[Security] 🔴 拦截: ${event.reason} (${event.layer})`);
    } else if (event.event === SecurityEvent.REVIEW) {
      console.log(`[Security] 🟡 审核: ${event.reason} (${event.layer})`);
    }
  }

  /**
   * 获取日志
   */
  getLogs(filter = {}) {
    let logs = this.logs;

    if (filter.event) {
      logs = logs.filter(l => l.event === filter.event);
    }
    if (filter.layer) {
      logs = logs.filter(l => l.layer === filter.layer);
    }
    if (filter.from) {
      logs = logs.filter(l => l.from === filter.from);
    }

    return logs;
  }

  /**
   * 生成合规报告
   */
  generateReport(startTime, endTime) {
    const logs = this.logs.filter(l => 
      l.timestamp >= startTime && l.timestamp <= endTime
    );

    const blocked = logs.filter(l => l.event === SecurityEvent.BLOCKED);
    const review = logs.filter(l => l.event === SecurityEvent.REVIEW);

    return {
      period: { startTime, endTime },
      summary: {
        total: logs.length,
        blocked: blocked.length,
        review: review.length,
        passed: logs.filter(l => l.event === SecurityEvent.PASSED).length
      },
      byLayer: {
        edge: logs.filter(l => l.layer === 'edge').length,
        tee: logs.filter(l => l.layer === 'tee').length,
        network: logs.filter(l => l.layer === 'network').length
      },
      byReason: blocked.reduce((acc, l) => {
        acc[l.reason] = (acc[l.reason] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

/**
 * 多层安全框架
 */
class SecurityFramework {
  constructor(options = {}) {
    this.edge = new EdgeSecurityCheck(options.edge);
    this.tee = new TEEIntentAnalysis(options.tee);
    this.network = new NetworkBehaviorAnalysis(options.network);
    this.logger = new SecurityLogger(options.logger);
    
    // 拦截时的通知回调
    this.onBlock = options.onBlock || null;
    this.onReview = options.onReview || null;
  }

  /**
   * 执行多层安全检查
   */
  async check(content, context = {}) {
    const results = [];
    let finalDecision = SecurityEvent.PASSED;

    // 第一层：边缘端预检
    const edgeResult = await this.edge.check(content);
    results.push(edgeResult);
    this.logger.log({ ...edgeResult, ...context, layer: 'edge' });

    if (edgeResult.event === SecurityEvent.BLOCKED) {
      return this._handleBlocked(edgeResult, results, context);
    }

    // 第二层：TEE深度分析
    const teeResult = await this.tee.analyze(content, context);
    results.push(teeResult);
    this.logger.log({ ...teeResult, ...context, layer: 'tee' });

    if (teeResult.event === SecurityEvent.BLOCKED) {
      return this._handleBlocked(teeResult, results, context);
    }

    // 第三层：网络行为分析
    const networkResult = await this.network.analyze(
      context.publisherId,
      context.taskData || {},
      context
    );
    results.push(networkResult);
    this.logger.log({ ...networkResult, ...context, layer: 'network' });

    if (networkResult.event === SecurityEvent.BLOCKED) {
      return this._handleBlocked(networkResult, results, context);
    }

    // 汇总结果
    const reviewNeeded = results.some(r => r.event === SecurityEvent.REVIEW);
    if (reviewNeeded) {
      finalDecision = SecurityEvent.REVIEW;
      if (this.onReview) {
        this.onReview(results, context);
      }
    }

    return {
      decision: finalDecision,
      results,
      timestamp: Date.now()
    };
  }

  /**
   * 处理拦截
   */
  _handleBlocked(result, allResults, context) {
    if (this.onBlock) {
      this.onBlock(result, context);
    }

    return {
      decision: SecurityEvent.BLOCKED,
      reason: result.reason,
      layer: result.layer,
      results: allResults,
      timestamp: Date.now(),
      // 返回给发布方的拒绝通知
      notification: {
        code: result.reason,
        message: this._getErrorMessage(result.reason)
      }
    };
  }

  /**
   * 获取错误消息
   */
  _getErrorMessage(code) {
    const messages = {
      prompt_injection_detected: '任务内容包含潜在的安全风险',
      malicious_intent: '检测到恶意意图',
      social_engineering: '检测到社会工程攻击',
      illegal_content: '任务内容违反法律法规',
      anomalous_behavior: '检测到异常行为模式'
    };
    return messages[code] || '安全检查未通过';
  }

  /**
   * 获取安全日志
   */
  getLogs(filter) {
    return this.logger.getLogs(filter);
  }

  /**
   * 生成合规报告
   */
  generateReport(startTime, endTime) {
    return this.logger.generateReport(startTime, endTime);
  }
}

module.exports = {
  SecurityFramework,
  SecurityEvent,
  ThreatType,
  EdgeSecurityCheck,
  TEEIntentAnalysis,
  NetworkBehaviorAnalysis,
  SecurityLogger
};
