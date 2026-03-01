/**
 * 01门 - TEE 信用证明模块
 * 基于硬件的信用抵押，无需全额预付
 */

const crypto = require('crypto');

/**
 * TEE 硬件证明
 */
class TEEProof {
  constructor(options = {}) {
    this.nodeId = options.nodeId;
    this.totalAssets = options.totalAssets;
    this.enclaveHash = options.enclaveHash || 'default_enclave';
    this.timestamp = options.timestamp || Date.now();
    this.validUntil = options.validUntil || (Date.now() + 24 * 60 * 60 * 1000);
    this.proof = options.proof || null;
  }

  /**
   * 生成 TEE 证明（模拟）
   * 生产环境需要 Intel SGX 或 ARM TrustZone
   */
  static generate(nodeId, totalAssets, enclavePrivateKey) {
    const data = JSON.stringify({
      nodeId,
      totalAssets,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex')
    });

    // 模拟硬件签名
    const crypto = require('crypto');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(data);
    const proof = sign.sign(enclavePrivateKey);

    return new TEEProof({
      nodeId,
      totalAssets,
      proof: proof.toString('base64'),
      enclaveHash: crypto.createHash('sha256').update(data).digest('hex')
    });
  }

  /**
   * 验证证明
   */
  verify(attestationPublicKey) {
    if (!this.proof) return false;

    // 生产环境需要真正的验证
    // 这里简化处理
    return this.proof && this.proof.length > 0;
  }

  /**
   * 检查是否过期
   */
  isExpired() {
    return Date.now() > this.validUntil;
  }

  toJSON() {
    return {
      nodeId: this.nodeId,
      totalAssets: this.totalAssets,
      enclaveHash: this.enclaveHash,
      timestamp: this.timestamp,
      validUntil: this.validUntil,
      proof: this.proof
    };
  }
}

/**
 * 信用额度计算
 */
class CreditCalculator {
  /**
   * 根据信誉分和 TEE 证明计算信用额度
   */
  static calculate(creditScore, teeProof, riskLevel = 'medium') {
    const baseLimit = creditScore * 10; // 基础额度 = 信誉分 * 10

    // TEE 信用加成
    let teeMultiplier = 1.0;
    if (teeProof && teeProof.verify()) {
      if (teeProof.totalAssets > 10000) teeMultiplier = 3.0;
      else if (teeProof.totalAssets > 5000) teeMultiplier = 2.0;
      else teeMultiplier = 1.5;
    }

    // 风险级别调整
    const riskMultipliers = {
      low: 1.0,
      medium: 0.7,
      high: 0.4
    };

    const limit = baseLimit * teeMultiplier * (riskMultipliers[riskLevel] || 0.7);

    return {
      creditLimit: Math.floor(limit),
      teeMultiplier,
      riskLevel,
      availableCredit: limit,
      validUntil: teeProof ? teeProof.validUntil : Date.now()
    };
  }
}

/**
 * 信用服务
 */
class CreditService {
  constructor(options = {}) {
    this.credits = new Map(); // nodeId -> CreditInfo
  }

  /**
   * 注册信用证明
   */
  registerProof(nodeId, teeProof) {
    const creditScore = this._getCreditScore(nodeId);
    const creditInfo = CreditCalculator.calculate(creditScore, teeProof);

    this.credits.set(nodeId, {
      ...creditInfo,
      teeProof: teeProof.toJSON(),
      registeredAt: Date.now()
    });

    console.log(`[Credit] Node ${nodeId} credit limit: ${creditInfo.creditLimit}`);
    return creditInfo;
  }

  /**
   * 获取信用额度
   */
  getCreditLimit(nodeId) {
    const credit = this.credits.get(nodeId);
    if (!credit) {
      return { creditLimit: 100, availableCredit: 100 }; // 默认额度
    }

    // 检查是否过期
    if (credit.teeProof && Date.now() > credit.teeProof.validUntil) {
      return { creditLimit: 100, availableCredit: 100, expired: true };
    }

    return credit;
  }

  /**
   * 使用信用
   */
  useCredit(nodeId, amount) {
    const credit = this.getCreditLimit(nodeId);

    if (amount > credit.availableCredit) {
      throw new Error('Insufficient credit');
    }

    credit.availableCredit -= amount;
    this.credits.set(nodeId, credit);

    return credit;
  }

  /**
   * 获取信誉分
   */
  _getCreditScore(nodeId) {
    // 从信誉系统获取
    const { ReputationOracle } = require('./Reputation');
    const oracle = new ReputationOracle();
    return oracle.getScore(nodeId);
  }
}

module.exports = { TEEProof, CreditCalculator, CreditService };
