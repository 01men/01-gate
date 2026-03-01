/**
 * 01门 - 任务匹配引擎
 * 基于VRF的随机广播 + 技能匹配
 */

const { VRF } = require('../p2p/VRF');
const { ReputationOracle } = require('../core/Reputation');

class MatchEngine {
  constructor(options = {}) {
    this.reputation = options.reputation || new ReputationOracle();
    this.vrf = options.vrf || null;
    
    // 配置
    this.config = {
      initialBroadcastCount: 1000,  // 初始广播节点数
      retryBroadcastCount: 500,    // 重试广播节点数
      maxRetries: 5,               // 最大重试次数
      skillWeight: 0.4,           // 技能匹配权重
      reputationWeight: 0.3,       // 信誉权重
      completionRateWeight: 0.3    // 完成率权重
    };
  }

  /**
   * 初始化任务匹配
   */
  async initializeTask(task) {
    console.log(`[Match] Initializing task: ${task.id}`);
    
    // 1. 获取所有在线节点
    const onlineNodes = await this._getOnlineNodes();
    
    // 2. VRF随机选择初始广播目标
    const entropy = this._generateEntropy(task);
    const selected = await this._selectNodesVRF(
      onlineNodes,
      entropy,
      this.config.initialBroadcastCount
    );
    
    console.log(`[Match] Selected ${selected.length} nodes for initial broadcast`);
    
    return {
      taskId: task.id,
      selectedNodes: selected,
      broadcastCount: 1,
      entropy,
      nextBroadcastDelay: 0 // 立即广播
    };
  }

  /**
   * 处理广播重试
   */
  async retryBroadcast(task, previousResult) {
    const retryCount = previousResult.broadcastCount;
    
    if (retryCount >= this.config.maxRetries) {
      return {
        status: 'failed',
        reason: 'Max retries exceeded'
      };
    }
    
    // 计算下次延迟: 3 * (N + 6) 小时
    const delay = 3 * (retryCount + 6);
    
    // 减少广播数量
    const count = Math.max(
      100,
      Math.floor(this.config.initialBroadcastCount / (retryCount + 1))
    );
    
    // 重新生成熵
    const entropy = this._generateEntropy(task, retryCount);
    const onlineNodes = await this._getOnlineNodes();
    const selected = await this._selectNodesVRF(onlineNodes, entropy, count);
    
    console.log(`[Match] Retry #${retryCount + 1}: ${count} nodes, delay: ${delay}h`);
    
    return {
      taskId: task.id,
      status: 'retry',
      selectedNodes: selected,
      broadcastCount: retryCount + 1,
      entropy,
      nextBroadcastDelay: delay * 60 * 60 * 1000 // 转换为毫秒
    };
  }

  /**
   * 评估节点是否适合任务
   */
  evaluateNode(nodeId, task) {
    const rep = this.reputation.getOrCreate(nodeId);
    
    // 技能匹配分数
    const skillScore = this._calculateSkillScore(rep, task.skills || []);
    
    // 信誉分数 (归一化到0-1)
    const repScore = Math.min(rep.score / 200, 1);
    
    // 完成率分数
    const completionScore = rep.getCompletionRate();
    
    // 综合分数
    const totalScore = 
      skillScore * this.config.skillWeight +
      repScore * this.config.reputationWeight +
      completionScore * this.config.completionRateWeight;
    
    return {
      nodeId,
      skillScore,
      repScore,
      completionScore,
      totalScore,
      isFlagged: rep.flags.length > 0,
      skills: rep.skills
    };
  }

  /**
   * 技能匹配评分
   */
  _calculateSkillScore(record, requiredSkills) {
    if (!requiredSkills || requiredSkills.length === 0) {
      return 0.5; // 无技能要求
    }
    
    const nodeSkills = record.skills || [];
    const matched = requiredSkills.filter(s => nodeSkills.includes(s));
    
    return matched.length / requiredSkills.length;
  }

  /**
   * 获取在线节点列表
   */
  async _getOnlineNodes() {
    // 简化：从信誉系统获取所有有历史的节点
    // 实际应该从P2P网络获取
    const allNodes = [];
    
    for (const [did] of this.reputation.records) {
      allNodes.push(did);
    }
    
    return allNodes;
  }

  /**
   * VRF选择节点
   */
  async _selectNodesVRF(nodes, entropy, count) {
    if (!this.vrf) {
      // 无VRF则随机选择
      return this._randomSelect(nodes, count);
    }
    
    // 使用VRF生成随机数进行选择
    const { random } = this.vrf.generate(entropy);
    const shuffled = this._shuffleWithRandom([...nodes], random);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  /**
   * 用随机数洗牌
   */
  _shuffleWithRandom(array, random) {
    const result = [...array];
    let seed = Math.floor(random * Number.MAX_SAFE_INTEGER);
    
    for (let i = result.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const j = seed % (i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    
    return result;
  }

  /**
   * 随机选择
   */
  _randomSelect(nodes, count) {
    const shuffled = [...nodes].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  /**
   * 生成熵
   */
  _generateEntropy(task, retryCount = 0) {
    const data = `${task.id}:${Date.now()}:${retryCount}`;
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * 查找最佳匹配节点
   */
  findBestMatch(task, candidates) {
    const scored = candidates.map(nodeId => ({
      nodeId,
      ...this.evaluateNode(nodeId, task)
    }));
    
    // 过滤被标记的节点
    const valid = scored.filter(s => !s.isFlagged);
    
    // 按分数排序
    valid.sort((a, b) => b.totalScore - a.totalScore);
    
    return valid[0] || null;
  }

  /**
   * 批量匹配
   */
  async batchMatch(tasks, maxPerTask = 10) {
    const results = [];
    
    for (const task of tasks) {
      const onlineNodes = await this._getOnlineNodes();
      const selected = this._randomSelect(onlineNodes, maxPerTask);
      
      const matches = selected.map(nodeId => ({
        nodeId,
        ...this.evaluateNode(nodeId, task)
      }));
      
      results.push({
        taskId: task.id,
        matches
      });
    }
    
    return results;
  }
}

module.exports = { MatchEngine };
