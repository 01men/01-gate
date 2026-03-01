/**
 * 01门 - VRF (可验证随机函数)
 * 用于防操纵的随机节点选择
 */

const crypto = require('crypto');

// 简化的VRF实现
// 生产环境应使用真正的VRF实现（如BLS12-381）

class VRF {
  constructor(privateKey, publicKey) {
    this.privateKey = privateKey;
    this.publicKey = publicKey;
  }

  /**
   * 生成随机数
   * @param {string} seed - 熵源（如区块链区块哈希）
   */
  generate(seed) {
    // 使用HMAC作为简化版VRF
    const hmac = crypto.createHmac('sha256', this.privateKey);
    hmac.update(seed);
    const random = hmac.digest();
    
    // 转换为0-1之间的浮点数
    const randomNum = parseInt(random.slice(0, 8).toString('hex'), 16) / Number.MAX_SAFE_INTEGER;
    
    return {
      random: randomNum,
      proof: random.toString('hex'),
      hash: crypto.createHash('sha256').update(random).digest('hex')
    };
  }

  /**
   * 验证随机数
   */
  static verify(publicKey, seed, random, proof) {
    // 简化验证：重新计算并比较
    const hmac = crypto.createHmac('sha256', publicKey);
    hmac.update(seed);
    const expected = hmac.digest();
    const expectedNum = expected.readUIntBE(0, 8) / (256 ** 8);
    
    return Math.abs(expectedNum - random) < 1e-10;
  }
}

/**
 * 节点选择器
 * 使用VRF从Kademlia DHT中随机选择节点
 */
class NodeSelector {
  constructor(vrf, options = {}) {
    this.vrf = vrf;
    this.k = options.k || 1000; // 选择节点数
    this.dht = options.dht || null;
  }

  /**
   * 从候选节点列表中选择
   * @param {string[]} candidates - 候选节点ID列表
   * @param {string} entropy - 熵源（区块链区块哈希）
   * @param {number} count - 选择数量
   */
  select(candidates, entropy, count = this.k) {
    if (!candidates || candidates.length === 0) {
      return [];
    }

    const { random, proof } = this.vrf.generate(entropy);
    
    // 使用随机数对候选列表进行加权随机选择
    const selected = [];
    const shuffled = this._shuffle([...candidates], random);
    
    for (let i = 0; i < Math.min(count, shuffled.length); i++) {
      selected.push(shuffled[i]);
    }

    return {
      nodes: selected,
      entropy,
      vrfProof: proof,
      random
    };
  }

  /**
   * Fisher-Yates洗牌算法
   */
  _shuffle(array, random) {
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
   * 两阶段选择：第一阶段VRF选择，第二阶段RTT探测
   * @param {string[]} candidates - 候选节点列表
   * @param {string} entropy - 熵源
   * @param {Function} rttChecker - RTT检测函数
   * @param {number} initialCount - 初始选择数量
   */
  async selectWithRTT(candidates, entropy, rttChecker, initialCount = 2000) {
    // 第一阶段：VRF选择
    const { nodes: vrfSelected } = this.select(candidates, entropy, initialCount);
    
    // 第二阶段：RTT探测
    const rttResults = await Promise.all(
      vrfSelected.map(async (nodeId) => {
        try {
          const rtt = await rttChecker(nodeId);
          return { nodeId, rtt };
        } catch (e) {
          return { nodeId, rtt: Infinity };
        }
      })
    );
    
    // 按RTT排序，选择最优的k个
    rttResults.sort((a, b) => a.rtt - b.rtt);
    
    const selected = rttResults
      .slice(0, this.k)
      .filter(r => r.rtt !== Infinity)
      .map(r => r.nodeId);
    
    return {
      nodes: selected,
      entropy,
      initialCount: vrfSelected.length,
      finalCount: selected.length,
      avgRTT: selected.length > 0 
        ? rttResults.slice(0, this.k).reduce((sum, r) => sum + r.rtt, 0) / selected.length 
        : Infinity
    };
  }
}

module.exports = { VRF, NodeSelector };
