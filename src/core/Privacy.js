/**
 * 01门 - 隐私保护模块
 * 基于局部差异隐私的动态扰动算法
 */

const crypto = require('crypto');

// GeoHash精度级别
const GEOHASH_PRECISION = {
  REGION: 1,   // ~156km x 156km
  CITY: 4,     // ~1.5km x 1.5km
  NEIGHBORHOOD: 6,  // ~0.61km x 0.61km
  STREET: 8    // ~0.019km x 0.019km
};

/**
 * GeoHash 编码
 */
class GeoHasher {
  static BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  
  /**
   * 经纬度转GeoHash
   */
  static encode(lat, lon, precision = 6) {
    let latRange = [-90, 90];
    let lonRange = [-180, 180];
    let hash = '';
    let bit = 0;
    let ch = 0;
    let isLon = true;
    
    while (hash.length < precision) {
      const range = isLon ? lonRange : latRange;
      const value = isLon ? lon : lat;
      const mid = (range[0] + range[1]) / 2;
      
      if (value >= mid) {
        ch |= (1 << (4 - bit));
        range[0] = mid;
      } else {
        range[1] = mid;
      }
      
      isLon = !isLon;
      if (bit < 4) {
        bit++;
      } else {
        hash += this.BASE32[ch];
        bit = 0;
        ch = 0;
      }
    }
    
    return hash;
  }
  
  /**
   * GeoHash转经纬度范围
   */
  static decode(hash) {
    let latRange = [-90, 90];
    let lonRange = [-180, 180];
    let isLon = true;
    
    for (let i = 0; i < hash.length; i++) {
      const idx = this.BASE32.indexOf(hash[i]);
      for (let bit = 4; bit >= 0; bit--) {
        const range = isLon ? lonRange : latRange;
        const mid = (range[0] + range[1]) / 2;
        
        if ((idx >> bit) & 1) {
          range[0] = mid;
        } else {
          range[1] = mid;
        }
        
        isLon = !isLon;
      }
    }
    
    return {
      lat: (latRange[0] + latRange[1]) / 2,
      lon: (lonRange[0] + lonRange[1]) / 2,
      latDelta: latRange[1] - latRange[0],
      lonDelta: lonRange[1] - lonRange[0]
    };
  }
}

/**
 * 局部差异隐私模块
 */
class LocalDifferentialPrivacy {
  constructor(options = {}) {
    this.epsilon = options.epsilon || 1.0; // 隐私预算
    this.sensitivity = options.sensitivity || 1.0; // 敏感度
    this.defaultPrecision = options.precision || GEOHASH_PRECISION.CITY;
  }

  /**
   * 拉普拉斯机制 - 添加噪声
   */
  laplaceMechanism(value, sensitivity, epsilon) {
    const scale = sensitivity / epsilon;
    const u = Math.random() - 0.5;
    const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    return value + noise;
  }

  /**
   * 指数机制 - 用于离散选择
   */
  exponentialMechanism(candidates, scoreFunction, epsilon) {
    const weights = candidates.map(c => Math.exp(epsilon * scoreFunction(c) / (2 * this.sensitivity)));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    
    let random = Math.random() * totalWeight;
    for (let i = 0; i < candidates.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return candidates[i];
      }
    }
    
    return candidates[candidates.length - 1];
  }

  /**
   * 地理位置隐私保护
   * 根据网络密度动态调整精度
   */
  protectLocation(lat, lon, networkDensity = 1.0) {
    // 网络密度越高，可以暴露越精确的位置
    // 密度范围: 0.1 (稀疏+ (密集)
    
    let) -> 10 precision;
    if (networkDensity < 0.5) {
      precision = GEOHASH_PRECISION.REGION;
    } else if (networkDensity < 2) {
      precision = GEOHASH_PRECISION.CITY;
    } else if (networkDensity < 5) {
      precision = GEOHASH_PRECISION.NEIGHBORHOOD;
    } else {
      precision = GEOHASH_PRECISION.STREET;
    }
    
    const geoHash = GeoHasher.encode(lat, lon, precision);
    
    // 添加噪声到坐标
    const noiseScale = 156 / Math.pow(10, precision); // 近似误差范围
    const noisyLat = lat + this.laplaceMechanism(0, noiseScale, this.epsilon);
    const noisyLon = lon + this.laplaceMechanism(0, noiseScale, this.epsilon);
    
    return {
      geoHash,
      precision,
      noisyLat: Math.round(noisyLat * 1000) / 1000,
      noisyLon: Math.round(noisyLon * 1000) / 1000,
      privacyLevel: networkDensity < 0.5 ? 'high' : networkDensity < 2 ? 'medium' : 'low'
    };
  }

  /**
   * 任务数据隐私保护
   */
  protectTaskData(taskData, fieldsToProtect = ['description', 'location']) {
    const protected = { ...taskData };
    
    for (const field of fieldsToProtect) {
      if (protected[field]) {
        // 对描述文本使用差分隐私
        const words = protected[field].split(' ');
        const protectedWords = words.map(word => {
          // 随机替换或保留
          if (Math.random() < 1 / (this.epsilon + 1)) {
            return '[REDACTED]';
          }
          return word;
        });
        protected[field] = protectedWords.join(' ');
      }
    }
    
    return protected;
  }

  /**
   * 聚合查询的差分隐私
   * 用于统计信息发布
   */
  protectAggregate(count, epsilon = null) {
    const e = epsilon || this.epsilon;
    // 使用拉普拉斯噪声保护计数
    const noisyCount = Math.round(this.laplaceMechanism(count, 1.0, e));
    return {
      original: count,
      protected: Math.max(0, noisyCount),
      epsilon: e
    };
  }
}

/**
 * 隐私保护服务
 */
class PrivacyService {
  constructor(options = {}) {
    this.ldp = new LocalDifferentialPrivacy(options);
    this.localDensity = new Map(); // 跟踪本地观察到的网络密度
  }

  /**
   * 更新网络密度估计
   */
  updateDensityEstimate(peerId, nearbyPeerCount) {
    // 指数移动平均
    const current = this.localDensity.get(peerId) || 0;
    const updated = 0.3 * nearbyPeerCount + 0.7 * current;
    this.localDensity.set(peerId, updated);
    return updated;
  }

  /**
   * 获取节点的位置隐私级别
   */
  getLocationPrivacyLevel(peerId) {
    const density = this.localDensity.get(peerId) || 1.0;
    
    if (density < 0.5) return 'high';
    if (density < 2) return 'medium';
    return 'low';
  }

  /**
   * 安全发布节点信息
   */
  publishNodeInfo(nodeInfo) {
    const density = this.localDensity.get(nodeInfo.peerId) || 1.0;
    
    const protected = {
      peerId: nodeInfo.peerId,
      // 位置信息需要保护
      ...(nodeInfo.location && {
        location: this.ldp.protectLocation(
          nodeInfo.location.lat,
          nodeInfo.location.lon,
          density
        )
      }),
      // 其他信息可以保留
      status: nodeInfo.status,
      skills: nodeInfo.skills,
      // 信誉信息添加噪声
      reputation: this.ldp.protectAggregate(nodeInfo.reputation || 0).protected
    };
    
    return protected;
  }

  /**
   * 验证隐私保护级别
   */
  verifyPrivacy(protectedData, originalData, epsilon = null) {
    // 计算信息泄露量
    const e = epsilon || this.ldp.epsilon;
    
    // 差分隐私的隐私损失
    const privacyLoss = Math.exp(e) - 1;
    
    return {
      epsilon: e,
      privacyLoss,
      isProtected: privacyLoss < 0.5 // 隐私损失小于50%认为可接受
    };
  }
}

module.exports = {
  GeoHasher,
  GEOHASH_PRECISION,
  LocalDifferentialPrivacy,
  PrivacyService
};
