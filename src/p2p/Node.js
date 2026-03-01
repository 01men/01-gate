/**
 * 01门 - P2P 节点模块 (简化版)
 * 用于测试和演示
 */

const EventEmitter = require('events');

class P2PNode extends EventEmitter {
  constructor(options = {}) {
    super();
    this.peerId = options.peerId || `node_${Date.now()}`;
    this.port = options.port || 0;
    this.bootstrapNodes = options.bootstrapNodes || [];
    this.peers = new Set();
    this.tasks = new Map();
    
    // 事件处理
    this.onTaskBroadcast = options.onTaskBroadcast || null;
    this.onTaskAccept = options.onTaskAccept || null;
    this.onMessage = options.onMessage || null;
  }

  /**
   * 启动节点
   */
  async start() {
    console.log(`[P2P] 节点启动: ${this.peerId}`);
    console.log(`[P2P] 监听端口: ${this.port || '随机'}`);
    return this;
  }

  /**
   * 停止节点
   */
  async stop() {
    console.log('[P2P] 节点已停止');
  }

  /**
   * 广播任务
   */
  async broadcastTask(task) {
    this.tasks.set(task.id, task);
    console.log(`[P2P] 任务已广播: ${task.id}`);
    
    if (this.onTaskBroadcast) {
      this.onTaskBroadcast(task);
    }
    
    return { success: true, peers: this.peers.size };
  }

  /**
   * 订阅任务
   */
  async subscribeToTasks(handler) {
    this.on('task', (task) => handler(task, this.peerId));
    console.log('[P2P] 已订阅任务');
  }

  /**
   * 连接到节点
   */
  async connect(peerId) {
    this.peers.add(peerId);
    console.log(`[P2P] 已连接: ${peerId}`);
  }

  /**
   * 获取在线节点
   */
  getPeers() {
    return Array.from(this.peers);
  }

  /**
   * 发送任务
   */
  async sendTask(peerId, task) {
    console.log(`[P2P] 发送任务给 ${peerId}: ${task.id}`);
  }
}

module.exports = { P2PNode };
