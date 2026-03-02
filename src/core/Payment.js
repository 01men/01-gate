/**
 * 01门 - 支付网关模块
 * 稳定币支付与法币兑换
 */

const crypto = require('crypto');

// 支持的支付方式
const PaymentMethod = {
  CRYPTO: 'crypto',
  FIAT: 'fiat',
  STABLECOIN: 'stablecoin'
};

// 支持的稳定币
const SupportedTokens = {
  USDC: {
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    decimals: 6,
    network: 'ethereum'
  },
  USDT: {
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    decimals: 6,
    network: 'ethereum'
  },
  DAI: {
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    decimals: 18,
    network: 'ethereum'
  }
};

/**
 * 汇率信息
 */
class ExchangeRate {
  constructor(options = {}) {
    this.from = options.from;
    this.to = options.to;
    this.rate = options.rate;
    this.timestamp = options.timestamp || Date.now();
    this.source = options.source || 'internal';
    this.expiresAt = options.timestamp + (options.ttl || 300000); // 默认5分钟
  }

  isExpired() {
    return Date.now() > this.expiresAt;
  }
}

/**
 * 汇率服务
 */
class ExchangeRateService {
  constructor(options = {}) {
    this.rates = new Map();
    this.cache = new Map();
    this.cacheTTL = options.cacheTTL || 300000; // 5分钟
  }

  /**
   * 获取汇率
   */
  async getRate(from, to) {
    const key = `${from}_${to}`;
    
    // 检查缓存
    const cached = this.cache.get(key);
    if (cached && !cached.isExpired()) {
      return cached;
    }

    // 模拟汇率获取
    // 生产环境应调用外部 API (CoinGecko, CoinMarketCap 等)
    let rate;
    
    if (from === to) {
      rate = 1;
    } else if (from === 'USD') {
      rate = await this._getFiatRate(to);
    } else if (to === 'USD') {
      rate = await this._getCryptoRate(from);
    } else {
      // 交叉汇率
      const fromUSD = await this.getRate(from, 'USD');
      const toUSD = await this.getRate(to, 'USD');
      rate = fromUSD.rate / toUSD.rate;
    }

    const exchangeRate = new ExchangeRate({
      from,
      to,
      rate,
      source: 'simulated'
    });

    this.cache.set(key, exchangeRate);
    return exchangeRate;
  }

  /**
   * 获取法币汇率（模拟）
   */
  async _getFiatRate(currency) {
    const rates = {
      CNY: 7.24,
      EUR: 0.92,
      GBP: 0.79,
      JPY: 149.5,
      KRW: 1320
    };
    return { rate: rates[currency] || 1, timestamp: Date.now() };
  }

  /**
   * 获取加密货币汇率（模拟）
   */
  async _getCryptoRate(token) {
    const rates = {
      ETH: 3250,
      BTC: 68000
    };
    return { rate: rates[token] || 1, timestamp: Date.now() };
  }

  /**
   * 批量获取汇率
   */
  async getRates(pairs) {
    const results = {};
    
    for (const [from, to] of pairs) {
      results[`${from}_${to}`] = await this.getRate(from, to);
    }
    
    return results;
  }
}

/**
 * 法币支付
 */
class FiatPayment {
  constructor(options = {}) {
    this.currency = options.currency || 'CNY';
    this.provider = options.provider || 'stripe'; // stripe, alipay, wechat
  }

  /**
   * 创建支付
   */
  async createPayment(amount, currency, options = {}) {
    // 模拟支付创建
    const payment = {
      id: `pay_${Date.now()}`,
      amount,
      currency,
      status: 'pending',
      provider: this.provider,
      metadata: options.metadata || {},
      createdAt: Date.now(),
      expiresAt: Date.now() + 15 * 60 * 1000 // 15分钟过期
    };

    console.log(`[FiatPayment] 创建支付: ${payment.id}, 金额: ${amount} ${currency}`);

    return payment;
  }

  /**
   * 确认支付
   */
  async confirmPayment(paymentId) {
    // 模拟支付确认
    return {
      id: paymentId,
      status: 'completed',
      confirmedAt: Date.now()
    };
  }

  /**
   * 退款
   */
  async refund(paymentId, amount, reason) {
    return {
      id: `refund_${Date.now()}`,
      paymentId,
      amount,
      reason,
      status: 'completed',
      refundedAt: Date.now()
    };
  }
}

/**
 * 稳定币支付
 */
class StablecoinPayment {
  constructor(options = {}) {
    this.token = options.token || 'USDC';
    this.network = options.network || 'ethereum';
  }

  /**
   * 创建支付
   */
  async createPayment(from, to, amount, token = this.token) {
    const tokenInfo = SupportedTokens[token];
    if (!tokenInfo) {
      throw new Error(`不支持的代币: ${token}`);
    }

    // 模拟链上交易
    const payment = {
      id: `crypto_${Date.now()}`,
      from,
      to,
      amount,
      token,
      tokenAddress: tokenInfo.address,
      decimals: tokenInfo.decimals,
      network: this.network,
      status: 'pending',
      txHash: null,
      createdAt: Date.now()
    };

    console.log(`[StablecoinPayment] 创建支付: ${payment.id}, 金额: ${amount} ${token}`);

    return payment;
  }

  /**
   * 确认支付
   */
  async confirmPayment(paymentId, txHash) {
    // 模拟交易确认
    return {
      id: paymentId,
      txHash,
      status: 'confirmed',
      confirmedAt: Date.now()
    };
  }

  /**
   * 获取交易状态
   */
  async getTransactionStatus(txHash) {
    // 模拟查询
    return {
      txHash,
      status: 'confirmed',
      confirmations: 12,
      blockNumber: 18500000
    };
  }
}

/**
 * 支付网关
 */
class PaymentGateway {
  constructor(options = {}) {
    this.exchange = new ExchangeRateService();
    this.fiat = new FiatPayment(options.fiat);
    this.stablecoin = new StablecoinPayment(options.stablecoin);
    this.supportedFiat = ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'KRW'];
    this.supportedTokens = Object.keys(SupportedTokens);
  }

  /**
   * 创建支付请求
   */
  async createPayment(options) {
    const {
      amount,
      currency,
      method,
      token,
      from,
      to,
      metadata = {}
    } = options;

    if (method === PaymentMethod.CRYPTO || method === PaymentMethod.STABLECOIN) {
      return await this._createCryptoPayment(amount, token, from, to, metadata);
    } else if (method === PaymentMethod.FIAT) {
      return await this._createFiatPayment(amount, currency, metadata);
    }

    throw new Error(`不支持的支付方式: ${method}`);
  }

  /**
   * 创建加密货币支付
   */
  async _createCryptoPayment(amount, token, from, to, metadata) {
    const payment = await this.stablecoin.createPayment(from, to, amount, token);
    payment.method = PaymentMethod.STABLECOIN;
    payment.metadata = metadata;
    return payment;
  }

  /**
   * 创建法币支付
   */
  async _createFiatPayment(amount, currency, metadata) {
    if (!this.supportedFiat.includes(currency)) {
      throw new Error(`不支持的法币: ${currency}`);
    }

    const payment = await this.fiat.createPayment(amount, currency, metadata);
    payment.method = PaymentMethod.FIAT;
    return payment;
  }

  /**
   * 法币转加密货币
   */
  async fiatToCrypto(amount, fiatCurrency, targetToken, targetAddress) {
    // 1. 获取汇率
    const rate = await this.exchange.getRate(fiatCurrency, 'USD');
    const usdAmount = amount / rate.rate;

    // 2. 获取代币汇率
    const tokenRate = await this.exchange.getRate('USD', targetToken);
    const tokenAmount = usdAmount * tokenRate.rate;

    // 3. 创建支付
    const payment = await this.stablecoin.createPayment(
      this._getGatewayAddress(),
      targetAddress,
      tokenAmount,
      targetToken
    );

    payment.fiatAmount = amount;
    payment.fiatCurrency = fiatCurrency;
    payment.usdRate = rate.rate;
    payment.tokenRate = tokenRate.rate;

    return payment;
  }

  /**
   * 加密货币转法币
   */
  async cryptoToFiat(token, amount, targetFiat, targetAccount) {
    // 1. 获取汇率
    const rate = await this.exchange.getRate(token, 'USD');
    const usdAmount = amount * rate.rate;

    // 2. 获取法币汇率
    const fiatRate = await this.exchange.getRate('USD', targetFiat);
    const fiatAmount = usdAmount * fiatRate.rate;

    // 3. 创建退款
    const refund = await this.fiat.refund(
      `pay_${Date.now()}`,
      fiatAmount,
      'crypto_conversion'
    );

    return {
      ...refund,
      originalToken: token,
      originalAmount: amount,
      usdAmount,
      fiatAmount,
      fiatCurrency: targetFiat
    };
  }

  /**
   * 汇率兑换
   */
  async exchangeCurrency(amount, from, to) {
    const rate = await this.exchange.getRate(from, to);
    
    return {
      from: { amount, currency: from },
      to: { amount: amount * rate.rate, currency: to },
      rate: rate.rate,
      timestamp: rate.timestamp
    };
  }

  /**
   * 获取网关地址
   */
  _getGatewayAddress() {
    return '0x0000000000000000000000000000000000000000'; // 占位符
  }

  /**
   * 获取支持的方式
   */
  getSupportedMethods() {
    return {
      fiat: this.supportedFiat,
      tokens: this.supportedTokens,
      methods: Object.values(PaymentMethod)
    };
  }
}

/**
 * 支付服务（整合）
 */
class PaymentService {
  constructor(options = {}) {
    this.gateway = new PaymentGateway(options);
    this.payments = new Map();
  }

  /**
   * 创建任务支付
   */
  async createTaskPayment(task, payer, options = {}) {
    const {
      method = PaymentMethod.STABLECOIN,
      currency = 'USD',
      token = 'USDC'
    } = options;

    const payment = await this.gateway.createPayment({
      amount: task.budget,
      currency,
      method,
      token,
      from: payer,
      to: this._getPlatformAddress(),
      metadata: {
        taskId: task.id,
        type: 'task_payment'
      }
    });

    this.payments.set(payment.id, payment);
    return payment;
  }

  /**
   * 确认支付
   */
  async confirmPayment(paymentId, txHash) {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      throw new Error('支付不存在');
    }

    if (payment.method === PaymentMethod.STABLECOIN) {
      const result = await this.stablecoin.confirmPayment(paymentId, txHash);
      payment.status = result.status;
    } else {
      payment.status = 'completed';
    }

    return payment;
  }

  /**
   * 获取支付状态
   */
  getPaymentStatus(paymentId) {
    return this.payments.get(paymentId);
  }

  /**
   * 汇率查询
   */
  async getExchangeRate(from, to) {
    return await this.gateway.exchange.getRate(from, to);
  }

  /**
   * 获取支持的支付方式
   */
  getSupportedPaymentMethods() {
    return this.gateway.getSupportedMethods();
  }

  _getPlatformAddress() {
    return '0x0000000000000000000000000000000000000001';
  }
}

module.exports = {
  PaymentGateway,
  PaymentService,
  ExchangeRateService,
  FiatPayment,
  StablecoinPayment,
  PaymentMethod,
  SupportedTokens
};
