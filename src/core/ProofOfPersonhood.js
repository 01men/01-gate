/**
 * 01门 - 人格证明模块 (Proof of Personhood)
 * 防止女巫攻击，确保真人身份
 */

const crypto = require('crypto');
const cryptoJs = require('crypto-js');

// 验证级别
const VerificationLevel = {
  NONE: 0,
  BASIC: 1,      // 邮箱/手机验证
  STANDARD: 2,   // Gitcoin Passport 多维度
  ADVANCED: 3,   // 生物识别 + 视频验证
  PREMIUM: 4     // 线下验证
};

/**
 * 身份凭证
 */
class IdentityCredential {
  constructor(options = {}) {
    this.id = options.id || crypto.randomUUID();
    this.did = options.did;
    this.provider = options.provider; // 验证提供商
    this.level = options.level || VerificationLevel.NONE;
    this.verifiedAt = options.verifiedAt || Date.now();
    this.expiresAt = options.expiresAt || (Date.now() + 365 * 24 * 60 * 60 * 1000);
    this.claims = options.claims || {}; // 验证声明
    this.proof = options.proof || null; // 验证证明
    this.status = options.status || 'active';
  }

  /**
   * 检查是否过期
   */
  isExpired() {
    return Date.now() > this.expiresAt;
  }

  /**
   * 检查是否有效
   */
  isValid() {
    return this.status === 'active' && !this.isExpired();
  }

  toJSON() {
    return {
      id: this.id,
      did: this.did,
      provider: this.provider,
      level: this.level,
      verifiedAt: this.verifiedAt,
      expiresAt: this.expiresAt,
      claims: this.claims,
      status: this.status
    };
  }
}

/**
 * Gitcoin Passport 集成
 */
class GitcoinPassport {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GITCOIN_API_KEY;
    this.scoringThreshold = options.scoringThreshold || 20;
  }

  /**
   * 验证 Passport
   */
  async verify(address) {
    // 模拟 Gitcoin Passport API 调用
    // 生产环境需要真正的 API 调用
    
    const passportScore = await this._fetchPassportScore(address);
    
    const result = {
      address,
      score: passportScore,
      stamps: await this._fetchStamps(address),
      verified: passportScore >= this.scoringThreshold,
      timestamp: Date.now()
    };

    return result;
  }

  /**
   * 获取 Passport 分数
   */
  async _fetchPassportScore(address) {
    // 模拟 API 响应
    // 实际应调用: https://api.scorer.gitcoin.co/v1/passport/score/{address}
    return Math.floor(Math.random() * 30); // 0-30 分
  }

  /**
   * 获取 stamps
   */
  async _fetchStamps(address) {
    // 模拟 stamps
    const availableStamps = [
      'Google',
      'Twitter',
      'Github',
      'Discord',
      'Telegram',
      'LinkedIn',
      'Ens',
      'Brightid'
    ];
    
    // 随机选择一些
    const count = Math.floor(Math.random() * 5) + 1;
    const selected = [];
    
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * availableStamps.length);
      selected.push(availableStamps[idx]);
    }
    
    return [...new Set(selected)];
  }

  /**
   * 计算验证级别
   */
  calculateLevel(score, stamps) {
    if (score >= 20 && stamps.length >= 5) return VerificationLevel.STANDARD;
    if (score >= 10 && stamps.length >= 3) return VerificationLevel.BASIC;
    return VerificationLevel.NONE;
  }
}

/**
 * 人格证明服务
 */
class ProofOfPersonhood extends Map {
  constructor(options = {}) {
    super();
    this.gitcoin = new GitcoinPassport(options.gitcoin);
    this.minLevel = options.minLevel || VerificationLevel.BASIC;
    this.credentials = new Map(); // did -> IdentityCredential
  }

  /**
   * 注册新身份
   */
  async register(did, provider = 'gitcoin') {
    if (provider === 'gitcoin') {
      // 从 DID 提取以太坊地址
      const address = this._extractAddress(did);
      
      if (!address) {
        throw new Error('无效的 DID 格式');
      }

      // 验证 Passport
      const verification = await this.gitcoin.verify(address);
      
      const credential = new IdentityCredential({
        did,
        provider: 'gitcoin_passport',
        level: verification.verified ? VerificationLevel.STANDARD : VerificationLevel.NONE,
        claims: {
          address,
          score: verification.score,
          stamps: verification.stamps
        },
        proof: verification
      });

      this.credentials.set(did, credential);
      this.set(did, credential);

      console.log(`[PoP] 注册完成: ${did}, 级别: ${credential.level}`);
      
      return {
        credential,
        verified: verification.verified,
        level: credential.level
      };
    }

    throw new Error(`未知提供商: ${provider}`);
  }

  /**
   * 验证身份
   */
  async verify(did) {
    const credential = this.credentials.get(did);
    
    if (!credential) {
      // 尝试重新验证
      return await this.register(did);
    }

    if (!credential.isValid()) {
      // 重新验证
      return await this.register(did);
    }

    return {
      credential,
      verified: credential.level >= this.minLevel,
      level: credential.level
    };
  }

  /**
   * 检查是否满足最低要求
   */
  meetsRequirement(did) {
    const credential = this.credentials.get(did);
    
    if (!credential) return false;
    if (!credential.isValid()) return false;
    
    return credential.level >= this.minLevel;
  }

  /**
   * 获取验证级别
   */
  getLevel(did) {
    const credential = this.credentials.get(did);
    return credential ? credential.level : VerificationLevel.NONE;
  }

  /**
   * 获取凭证
   */
  getCredential(did) {
    return this.credentials.get(did);
  }

  /**
   * 从 DID 提取地址
   */
  _extractAddress(did) {
    // 支持格式: did:01gate:0x... 或 did:eth:0x...
    if (did.startsWith('did:01gate:') || did.startsWith('did:eth:')) {
      return did.split(':').pop();
    }
    // 直接以太坊地址
    if (did.startsWith('0x') && did.length === 42) {
      return did;
    }
    return null;
  }

  /**
   * 批量验证
   */
  async batchVerify(dids) {
    const results = [];
    
    for (const did of dids) {
      try {
        const result = await this.verify(did);
        results.push({ did, ...result });
      } catch (e) {
        results.push({ did, verified: false, error: e.message });
      }
    }

    return results;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    let total = 0;
    const byLevel = {};
    const byProvider = {};

    for (const [did, cred] of this.credentials) {
      total++;
      byLevel[cred.level] = (byLevel[cred.level] || 0) + 1;
      byProvider[cred.provider] = (byProvider[cred.provider] || 0) + 1;
    }

    return {
      total,
      byLevel,
      byProvider,
      verified: Object.values(byLevel).reduce((a, b) => a + b, 0) - (byLevel[0] || 0)
    };
  }
}

/**
 * 真人验证中间件
 */
class PoPMiddleware {
  constructor(popService) {
    this.pop = popService;
  }

  /**
   * 验证请求者身份
   */
  async verifyRequester(did) {
    const result = await this.pop.verify(did);
    
    if (!result.verified) {
      throw new Error(`身份验证未通过: 需要级别 ${this.pop.minLevel}, 当前 ${result.level}`);
    }

    return result;
  }

  /**
   * 验证任务承接资格
   */
  async verifyTaskAcceptor(did) {
    const result = await this.verifyRequester(did);
    
    // 任务承接需要至少 STANDARD 级别
    if (result.level < VerificationLevel.STANDARD) {
      throw new Error(`任务承接需要更高验证级别: 需要 ${VerificationLevel.STANDARD}, 当前 ${result.level}`);
    }

    return result;
  }
}

module.exports = {
  ProofOfPersonhood,
  IdentityCredential,
  GitcoinPassport,
  PoPMiddleware,
  VerificationLevel
};
