/**
 * 01门 - 人类授权绑定模块
 * 阶段一：初始化与授权绑定
 */

const crypto = require('crypto');

/**
 * 授权状态
 */
const AuthorizationStatus = {
  PENDING: 'pending',       // 待确认
  AUTHORIZED: 'authorized', // 已授权
  REJECTED: 'rejected',     // 已拒绝
  REVOKED: 'revoked'        // 已撤销
};

/**
 * 人类账户
 */
class HumanAccount {
  constructor(options = {}) {
    this.id = options.id || `human_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.agentDid = options.agentDid; // 绑定的 Agent DID
    this.email = options.email;
    this.walletAddress = options.walletAddress;
    this.status = options.status || AuthorizationStatus.PENDING;
    this.verificationCode = options.verificationCode || null;
    this.verifiedAt = options.verifiedAt || null;
    this.createdAt = options.createdAt || Date.now();
    this.updatedAt = options.updatedAt || Date.now();
  }

  /**
   * 生成邮箱验证码
   */
  generateVerificationCode() {
    this.verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    this.updatedAt = Date.now();
    return this.verificationCode;
  }

  /**
   * 验证验证码
   */
  verifyCode(code) {
    if (this.verificationCode === code) {
      this.status = AuthorizationStatus.AUTHORIZED;
      this.verifiedAt = Date.now();
      this.verificationCode = null;
      return true;
    }
    return false;
  }

  /**
   * 授权 Agent
   */
  authorize(agentDid) {
    this.agentDid = agentDid;
    this.status = AuthorizationStatus.AUTHORIZED;
    this.updatedAt = Date.now();
    return this;
  }

  /**
   * 撤销授权
   */
  revoke() {
    this.status = AuthorizationStatus.REVOKED;
    this.updatedAt = Date.now();
    return this;
  }

  toJSON() {
    return {
      id: this.id,
      agentDid: this.agentDid,
      email: this.email,
      walletAddress: this.walletAddress,
      status: this.status,
      verifiedAt: this.verifiedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * 授权服务
 */
class AuthorizationService {
  constructor(options = {}) {
    this.accounts = new Map(); // email -> HumanAccount
    this.bindings = new Map(); // agentDid -> HumanAccount
    this.storagePath = options.storagePath || './data/authorization';
    this.verificationCodes = new Map(); // email -> { code, expires }

    this.load();
  }

  /**
   * 加载数据
   */
  load() {
    const fs = require('fs');
    const path = require('path');

    try {
      if (fs.existsSync(this.storagePath)) {
        const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        for (const account of data.accounts || []) {
          const acc = new HumanAccount(account);
          this.accounts.set(acc.email, acc);
          if (acc.agentDid) {
            this.bindings.set(acc.agentDid, acc);
          }
        }
      }
    } catch (e) {
      console.warn('[Auth] Load failed:', e.message);
    }
  }

  /**
   * 保存数据
   */
  save() {
    const fs = require('fs');
    const path = require('path');

    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = {
        accounts: Array.from(this.accounts.values()).map(a => a.toJSON())
      };

      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[Auth] Save failed:', e.message);
    }
  }

  /**
   * 请求授权绑定
   */
  requestBinding(agentDid, email, walletAddress) {
    // 检查是否已有绑定
    if (this.bindings.has(agentDid)) {
      const existing = this.bindings.get(agentDid);
      if (existing.status === AuthorizationStatus.AUTHORIZED) {
        throw new Error('Agent already has an authorized human');
      }
    }

    // 创建或更新账户
    let account = this.accounts.get(email);
    if (!account) {
      account = new HumanAccount({
        email,
        walletAddress
      });
      this.accounts.set(email, account);
    }

    // 生成验证码
    const code = account.generateVerificationCode();
    this.verificationCodes.set(email, {
      code,
      expires: Date.now() + 15 * 60 * 1000 // 15分钟有效
    });

    // 绑定 Agent
    account.agentDid = agentDid;
    account.status = AuthorizationStatus.PENDING;
    this.bindings.set(agentDid, account);

    this.save();

    console.log(`[Auth] Verification code for ${email}: ${code}`);

    return {
      accountId: account.id,
      email: account.email,
      status: account.status,
      message: 'Verification code sent'
    };
  }

  /**
   * 验证并完成绑定
   */
  verifyAndBind(email, code) {
    const account = this.accounts.get(email);
    if (!account) {
      throw new Error('Account not found');
    }

    // 检查验证码
    const stored = this.verificationCodes.get(email);
    if (!stored || stored.code !== code) {
      throw new Error('Invalid verification code');
    }

    if (Date.now() > stored.expires) {
      throw new Error('Verification code expired');
    }

    // 完成绑定
    account.verifyCode(code);
    this.bindings.set(account.agentDid, account);
    this.verificationCodes.delete(email);
    this.save();

    console.log(`[Auth] Agent ${account.agentDid} bound to ${email}`);

    return {
      success: true,
      agentDid: account.agentDid,
      email: account.email,
      status: account.status
    };
  }

  /**
   * 获取 Agent 绑定的人类
   */
  getHumanForAgent(agentDid) {
    return this.bindings.get(agentDid);
  }

  /**
   * 获取人类的 Agent
   */
  getAgentForHuman(email) {
    const account = this.accounts.get(email);
    return account ? account.agentDid : null;
  }

  /**
   * 检查授权状态
   */
  isAuthorized(agentDid) {
    const account = this.bindings.get(agentDid);
    return account && account.status === AuthorizationStatus.AUTHORIZED;
  }

  /**
   * 撤销授权
   */
  revokeAuthorization(agentDid) {
    const account = this.bindings.get(agentDid);
    if (!account) {
      throw new Error('Binding not found');
    }

    account.revoke();
    this.bindings.delete(agentDid);
    this.save();

    return { success: true };
  }

  /**
   * 列出所有授权
   */
  listAuthorizations() {
    return Array.from(this.bindings.values())
      .filter(a => a.status === AuthorizationStatus.AUTHORIZED)
      .map(a => a.toJSON());
  }
}

module.exports = { HumanAccount, AuthorizationService, AuthorizationStatus };
