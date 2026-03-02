/**
 * 01门 - 代币经济模块
 * 动态归属与价值捕获
 */

const crypto = require('crypto');

// 代币分配
const TokenAllocation = {
  TEAM: 0.15,        // 15% 团队
  INVESTORS: 0.10,   // 10% 投资者
  DAO_TREASURY: 0.20, // 20% DAO金库
  REWARDS: 0.35,     // 35% 生态奖励
  COMMUNITY: 0.10,    // 10% 社区空投
  AIRDROP: 0.05,    // 5% 预留
  PUBLIC_SALE: 0.05  // 5% 公开销售
};

// 网络阶段
const NetworkPhase = {
  BOOTSTRAP: 'bootstrap',     // 冷启动
  GROWTH: 'growth',           // 增长
  MATURITY: 'maturity',       // 成熟
  SUSTAINABLE: 'sustainable'  // 可持续
};

/**
 * 动态归属计划
 */
class DynamicVesting {
  constructor(options = {}) {
    this.totalSupply = options.totalSupply || 1000000000; // 10亿
    this.allocation = options.allocation || TokenAllocation;
    this.vestingSchedules = new Map(); // beneficiary -> VestingSchedule
    this.networkKPI = options.networkKPI || { gmv: 0, activeNodes: 0 };
    this.minPerformanceRatio = options.minPerformanceRatio || 0.5;
  }

  /**
   * 创建归属计划
   */
  createVesting(beneficiary, type, amount, options = {}) {
    const schedule = {
      beneficiary,
      type, // 'team', 'investor', 'advisor'
      totalAmount: amount,
      releasedAmount: 0,
      startTime: options.startTime || Date.now(),
      cliffPeriod: options.cliffPeriod || 365 * 24 * 60 * 60 * 1000, // 1年
      duration: options.duration || 1095 * 24 * 60 * 60 * 1000, // 3年
      kpiBased: options.kpiBased || false,
      kpiTarget: options.kpiTarget || null,
      performanceRatio: 1.0,
      status: 'active'
    };

    this.vestingSchedules.set(beneficiary, schedule);
    console.log(`[Vesting] 创建归属计划: ${beneficiary}, 总额: ${amount}`);

    return schedule;
  }

  /**
   * 释放代币（基于时间）
   */
  release(beneficiary) {
    const schedule = this.vestingSchedules.get(beneficiary);
    if (!schedule) {
      throw new Error('未找到归属计划');
    }

    const now = Date.now();
    const elapsed = now - schedule.startTime;

    // cliff 检查
    if (elapsed < schedule.cliffPeriod) {
      console.log(`[Vesting] 锁定期未结束`);
      return { released: 0, available: 0 };
    }

    // KPI 调整
    if (schedule.kpiBased) {
      schedule.performanceRatio = this._calculatePerformanceRatio(schedule);
    }

    // 计算可释放数量
    const vestedRatio = Math.min(1, elapsed / schedule.duration);
    const vestedAmount = schedule.totalAmount * vestedRatio * schedule.performanceRatio;
    const releasable = vestedAmount - schedule.releasedAmount;

    if (releasable > 0) {
      schedule.releasedAmount += releasable;
      console.log(`[Vesting] 释放: ${beneficiary}, 数量: ${releasable}`);
    }

    return {
      released: releasable,
      totalReleased: schedule.releasedAmount,
      totalVested: vestedAmount,
      performanceRatio: schedule.performanceRatio
    };
  }

  /**
   * 计算绩效比率
   */
  _calculatePerformanceRatio(schedule) {
    if (!schedule.kpiTarget) return 1.0;

    const { gmv, activeNodes } = this.networkKPI;
    const { gmv: targetGMV, nodes: targetNodes } = schedule.kpiTarget;

    const gmvRatio = targetGMV > 0 ? Math.min(1, gmv / targetGMV) : 0;
    const nodeRatio = targetNodes > 0 ? Math.min(1, activeNodes / targetNodes) : 0;

    const ratio = (gmvRatio + nodeRatio) / 2;
    return Math.max(this.minPerformanceRatio, ratio);
  }

  /**
   * 更新网络 KPI
   */
  updateNetworkKPI(kpi) {
    this.networkKPI = { ...this.networkKPI, ...kpi };
    console.log(`[Vesting] KPI 更新: GMV=${this.networkKPI.gmv}, Nodes=${this.networkKPI.activeNodes}`);
  }

  /**
   * 获取归属信息
   */
  getVestingInfo(beneficiary) {
    const schedule = this.vestingSchedules.get(beneficiary);
    if (!schedule) return null;

    const now = Date.now();
    const elapsed = now - schedule.startTime;
    const vestedRatio = Math.min(1, elapsed / schedule.duration);
    const vestedAmount = schedule.totalAmount * vestedRatio * schedule.performanceRatio;

    return {
      ...schedule,
      vestedAmount,
      releasableAmount: vestedAmount - schedule.releasedAmount,
      elapsedDays: Math.floor(elapsed / (24 * 60 * 60 * 1000)),
      remainingDays: Math.max(0, Math.floor((schedule.duration - elapsed) / (24 * 60 * 60 * 1000)))
    };
  }
}

/**
 * 手续费与价值捕获
 */
class FeeMechanism {
  constructor(options = {}) {
    this.phase = NetworkPhase.BOOTSTRAP;
    this.baseRates = {
      [NetworkPhase.BOOTSTRAP]: 0.03,   // 3%
      [NetworkPhase.GROWTH]: 0.05,      // 5%
      [NetworkPhase.MATURITY]: 0.08,    // 8%
      [NetworkPhase.SUSTAINABLE]: 0.10  // 10%
    };
    this.rewardsPool = 0;
    this.burnedAmount = 0;
    this.treasuryAmount = 0;
  }

  /**
   * 获取当前费率
   */
  getRate() {
    return this.baseRates[this.phase];
  }

  /**
   * 设置网络阶段
   */
  setPhase(phase) {
    if (!this.baseRates[phase]) {
      throw new Error(`未知阶段: ${phase}`);
    }
    this.phase = phase;
    console.log(`[Fee] 网络阶段: ${phase}, 费率: ${this.getRate() * 100}%`);
  }

  /**
   * 计算手续费
   */
  calculateFee(amount) {
    const rate = this.getRate();
    const fee = amount * rate;
    
    // 分配: 50% 销毁, 30% 金库, 20% 奖励池
    return {
      amount,
      rate,
      fee,
      toBurn: fee * 0.5,
      toTreasury: fee * 0.3,
      toRewards: fee * 0.2
    };
  }

  /**
   * 处理交易手续费
   */
  processFee(amount) {
    const breakdown = this.calculateFee(amount);
    
    this.rewardsPool += breakdown.toBurn; // 实际上用于销毁前的奖励
    this.treasuryAmount += breakdown.toTreasury;
    
    // 实际销毁
    this.burnedAmount += breakdown.toBurn;
    
    return breakdown;
  }

  /**
   * 获取费率历史
   */
  getFeeHistory() {
    return {
      currentPhase: this.phase,
      currentRate: this.getRate(),
      totalBurned: this.burnedAmount,
      totalToTreasury: this.treasuryAmount,
      rewardsPool: this.rewardsPool,
      phaseThresholds: Object.keys(this.baseRates).reduce((acc, phase) => {
        acc[phase] = this.baseRates[phase] * 100 + '%';
        return acc;
      }, {})
    };
  }
}

/**
 * 效用质押
 */
class UtilityStaking {
  constructor(options = {}) {
    this.stakes = new Map(); // did -> StakeInfo
    this.totalStaked = 0;
    this.minStake = options.minStake || 100;
    this.rewardPool = 0;
  }

  /**
   * 质押代币
   */
  stake(did, amount) {
    if (amount < this.minStake) {
      throw new Error(`最小质押量: ${this.minStake}`);
    }

    const existing = this.stakes.get(did) || {
      did,
      amount: 0,
      startTime: Date.now(),
      rewards: 0
    };

    existing.amount += amount;
    existing.startTime = Date.now(); // 重置开始时间
    this.stakes.set(did, existing);
    this.totalStaked += amount;

    console.log(`[Staking] 质押: ${did}, 数量: ${amount}`);

    return existing;
  }

  /**
   * 解除质押
   */
  unstake(did, amount) {
    const stake = this.stakes.get(did);
    if (!stake || stake.amount < amount) {
      throw new Error('质押不足');
    }

    stake.amount -= amount;
    this.totalStaked -= amount;

    if (stake.amount < this.minStake) {
      this.stakes.delete(did);
    }

    console.log(`[Staking] 解除质押: ${did}, 数量: ${amount}`);

    return stake;
  }

  /**
   * 计算质押收益
   */
  calculateRewards(did) {
    const stake = this.stakes.get(did);
    if (!stake) return 0;

    const period = (Date.now() - stake.startTime) / (24 * 60 * 60 * 1000); // 天
    const apy = 0.12; // 12% 年化
    const dailyRate = apy / 365;

    return stake.amount * dailyRate * period;
  }

  /**
   * 领取收益
   */
  claimRewards(did) {
    const rewards = this.calculateRewards(did);
    
    if (rewards > 0) {
      const stake = this.stakes.get(did);
      stake.rewards += rewards;
      stake.startTime = Date.now(); // 重置周期
      
      console.log(`[Staking] 领取收益: ${did}, 数量: ${rewards}`);
    }

    return rewards;
  }

  /**
   * 获取质押信息
   */
  getStakeInfo(did) {
    const stake = this.stakes.get(did);
    if (!stake) return null;

    return {
      ...stake,
      pendingRewards: this.calculateRewards(did),
      weight: this._calculateWeight(stake),
      totalStaked: this.totalStaked
    };
  }

  /**
   * 计算权重（用于任务优先级）
   */
  _calculateWeight(stake) {
    const period = (Date.now() - stake.startTime) / (24 * 60 * 60 * 1000);
    const periodBonus = Math.min(1.5, 1 + period / 365 * 0.5); // 最多 1.5 倍
    return stake.amount * periodBonus;
  }

  /**
   * 获取所有质押者
   */
  getAllStakers() {
    return Array.from(this.stakes.values());
  }
}

/**
 * 代币经济服务
 */
class TokenEconomics {
  constructor(options = {}) {
    this.vesting = new DynamicVesting(options.vesting);
    this.fees = new FeeMechanism(options.fees);
    this.staking = new UtilityStaking(options.staking);
    this.tokenAddress = options.tokenAddress || null;
  }

  /**
   * 初始化
   */
  async initialize() {
    console.log('[Economics] 代币经济模块初始化');
    
    // 初始化团队归属
    this.vesting.createVesting('team_treasury', 'team', 150000000, {
      kpiBased: true,
      kpiTarget: { gmv: 1000000, nodes: 10000 }
    });

    // 初始化投资者归属
    this.vesting.createVesting('investor_vesting', 'investor', 100000000, {
      cliffPeriod: 180 * 24 * 60 * 60 * 1000, // 6个月
      duration: 730 * 24 * 60 * 60 * 1000 // 2年
    });
  }

  /**
   * 处理任务结算
   */
  processTaskSettlement(taskAmount) {
    // 1. 扣除手续费
    const feeBreakdown = this.fees.processFee(taskAmount);
    
    // 2. 分配给供给方
    const payout = taskAmount - feeBreakdown.fee;
    
    return {
      grossAmount: taskAmount,
      fee: feeBreakdown.fee,
      burned: feeBreakdown.toBurn,
      treasury: feeBreakdown.toTreasury,
      rewards: feeBreakdown.toRewards,
      payout,
      netPercent: ((payout / taskAmount) * 100).toFixed(1)
    };
  }

  /**
   * 更新网络指标
   */
  updateNetworkMetrics(gmv, activeNodes) {
    this.vesting.updateNetworkKPI({ gmv, activeNodes });
    
    // 根据节点数自动调整阶段
    if (activeNodes > 100000) {
      this.fees.setPhase(NetworkPhase.SUSTAINABLE);
    } else if (activeNodes > 10000) {
      this.fees.setPhase(NetworkPhase.MATURITY);
    } else if (activeNodes > 1000) {
      this.fees.setPhase(NetworkPhase.GROWTH);
    } else {
      this.fees.setPhase(NetworkPhase.BOOTSTRAP);
    }
  }

  /**
   * 获取经济概览
   */
  getOverview() {
    return {
      vesting: {
        totalSchedules: this.vesting.ventingSchedules?.size || 0,
        networkKPI: this.vesting.networkKPI
      },
      fees: this.fees.getFeeHistory(),
      staking: {
        totalStaked: this.staking.totalStaked,
        stakerCount: this.staking.stakes.size
      }
    };
  }
}

module.exports = {
  TokenEconomics,
  DynamicVesting,
  FeeMechanism,
  UtilityStaking,
  TokenAllocation,
  NetworkPhase
};
