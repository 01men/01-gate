/**
 * 01门 - P2P 网络模块
 * 集成 Libp2p 和 Kademlia DHT
 */

const Libp2p = require('libp2p');
const TCP = require('libp2p-tcp');
const WebSockets = require('libp2p-websockets');
const Mplex = require('libp2p-mplex');
const Noise = require('libp2p-noise');
const KadDHT = require('libp2p-kad-dht');
const GossipSub = require('libp2p-gossipsub');
const { multiaddr } = require('multiaddr');
const { fromString: uint8ArrayFromString } = require('uint8arrays/from-string');
const { toString: uint8ArrayToString } = require('uint8arrays/to-string');
const EventEmitter = require('events');

/**
 * P2P网络服务
 */
class P2PNetwork extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.node = null;
    this.peerId = null;
    this.topics = new Set();
    this.connectedPeers = new Set();
  }

  /**
   * 初始化并启动节点
   */
  async start() {
    const { createLibp2p } = Libp2p;

    this.node = await createLibp2p({
      addresses: {
        listen: [
          `/ip4/0.0.0.0/tcp/${this.options.port || 0}`,
          `/ip4/0.0.0.0/tcp/${this.options.port || 0}/ws`
        ]
      },
      transports: [
        TCP(),
        WebSockets()
      ],
      streamMuxers: [
        new Mplex()
      ],
      connectionEncryption: [
        new Noise()
      ],
      dht: new KadDHT({
        clientMode: this.options.clientMode !== false
      }),
      pubsub: new GossipSub({
        allowPublishToZeroPeers: true,
        fallbackToFloodsub: true
      }),
      peerStore: {
        persistence: true,
        threshold: 50
      }
    });

    this.peerId = this.node.peerId.toB58String();
    
    // 事件监听
    this.node.connectionManager.on('peer:connect', (connection) => {
      const peerId = connection.remotePeer.toB58String();
      this.connectedPeers.add(peerId);
      console.log(`[P2P] 连接到节点: ${peerId}`);
      this.emit('peer:connect', peerId);
    });

    this.node.connectionManager.on('peer:disconnect', (connection) => {
      const peerId = connection.remotePeer.toB58String();
      this.connectedPeers.delete(peerId);
      console.log(`[P2P] 断开连接: ${peerId}`);
      this.emit('peer:disconnect', peerId);
    });

    // DHT事件
    this.node.dht.on('peer:found', (peerInfo) => {
      console.log(`[P2P] 发现新节点: ${peerInfo.id.toB58String()}`);
      this.emit('peer:found', peerInfo);
    });

    await this.node.start();
    
    console.log(`[P2P] 节点已启动: ${this.peerId}`);
    console.log(`[P2P] 监听地址: ${this.node.multiaddrs.map(m => m.toString()).join(', ')}`);
    
    return this;
  }

  /**
   * 停止节点
   */
  async stop() {
    if (this.node) {
      await this.node.stop();
      console.log('[P2P] 节点已停止');
    }
  }

  /**
   * 连接到引导节点
   */
  async connectToBootstrap(nodes) {
    if (!this.node) throw new Error('节点未启动');
    
    for (const addr of nodes) {
      try {
        const ma = multiaddr(addr);
        await this.node.dial(ma);
        console.log(`[P2P] 已连接至引导节点: ${addr}`);
      } catch (e) {
        console.warn(`[P2P] 连接引导节点失败: ${addr}`, e.message);
      }
    }
  }

  /**
   * 订阅主题
   */
  async subscribe(topic) {
    if (!this.node) throw new Error('节点未启动');
    
    await this.node.pubsub.subscribe(topic, (msg) => {
      const data = uint8ArrayToString(msg.data);
      try {
        const parsed = JSON.parse(data);
        this.emit('message', { topic, data: parsed, from: msg.from.toB58String() });
      } catch (e) {
        this.emit('message', { topic, raw: data, from: msg.from.toB58String() });
      }
    });
    
    this.topics.add(topic);
    console.log(`[P2P] 已订阅主题: ${topic}`);
  }

  /**
   * 发布消息
   */
  async publish(topic, data) {
    if (!this.node) throw new Error('节点未启动');
    
    const message = uint8ArrayFromString(JSON.stringify(data));
    await this.node.pubsub.publish(topic, message);
    
    console.log(`[P2P] 已发布到 ${topic}: ${JSON.stringify(data).slice(0, 50)}...`);
  }

  /**
   * 查找节点
   */
  async findPeer(peerId) {
    if (!this.node) throw new Error('节点未启动');
    
    try {
      const peerInfo = await this.node.dht.findPeer(peerId);
      return peerInfo;
    } catch (e) {
      return null;
    }
  }

  /**
   * 查找附近节点
   */
  async getNearestPeers(key, count = 20) {
    if (!this.node) throw new Error('节点未启动');
    
    const peers = await this.node.dht.getClosestPeers(key);
    const result = [];
    for await (const peer of peers) {
      result.push(peer.id.toB58String());
      if (result.length >= count) break;
    }
    return result;
  }

  /**
   * 获取所有连接节点
   */
  getConnectedPeers() {
    return Array.from(this.connectedPeers);
  }

  /**
   * 获取节点数
   */
  getPeerCount() {
    return this.connectedPeers.size;
  }
}

/**
 * Kademlia DHT 路由
 */
class KademliaRouter {
  constructor(node) {
    this.node = node;
  }

  /**
   * 根据DID获取节点列表
   */
  async getNodesForDID(did, count = 1000) {
    // 将DID转换为Kademlia key
    const key = uint8ArrayFromString(did);
    return await this.node.dht.getClosestPeers(key);
  }

  /**
   * 存储数据
   */
  async put(key, value) {
    return await this.node.dht.put(key, value);
  }

  /**
   * 获取数据
   */
  async get(key) {
    return await this.node.dht.get(key);
  }
}

/**
 * GossipSub 协议
 */
class GossipProtocol {
  constructor(node) {
    this.node = node;
    this.topicHandlers = new Map();
  }

  /**
   * 创建任务广播网格
   */
  async createTaskMesh(taskId) {
    const topic = `task:${taskId}`;
    await this.node.pubsub.subscribe(topic);
    console.log(`[Gossip] 创建任务网格: ${topic}`);
    return topic;
  }

  /**
   * 向网格发送任务
   */
  async publishToMesh(taskId, taskData) {
    const topic = `task:${taskId}`;
    const message = uint8ArrayFromString(JSON.stringify(taskData));
    await this.node.pubsub.publish(topic, message);
  }
}

module.exports = { P2PNetwork, KademliaRouter, GossipProtocol };
