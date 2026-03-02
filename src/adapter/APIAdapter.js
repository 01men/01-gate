/**
 * 01门 - API 适配器
 * 一键接入，让现有 Agent 能在3分钟内接入网络
 */

const express = require('express');
const { Gate01 } = require('../index');

/**
 * API 适配器
 */
class APIAdapter {
  constructor(options = {}) {
    this.gate = null;
    this.app = express();
    this.port = options.port || 3000;
    this.setupRoutes();
  }

  /**
   * 设置路由
   */
  setupRoutes() {
    this.app.use(express.json());
    
    // 健康检查
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });
    
    // 获取节点状态
    this.app.get('/api/status', (req, res) => {
      if (!this.gate) {
        return res.status(503).json({ error: 'Node not initialized' });
      }
      res.json(this.gate.getStatus());
    });
    
    // 创建任务
    this.app.post('/api/tasks', async (req, res) => {
      try {
        const task = await this.gate.createTask(req.body);
        res.json(task.toJSON());
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    });
    
    // 获取任务列表
    this.app.get('/api/tasks', (req, res) => {
      if (!this.gate) {
        return res.status(503).json({ error: 'Node not initialized' });
      }
      const tasks = this.gate.getTasks(req.query);
      res.json(tasks.map(t => t.toJSON()));
    });
    
    // 获取任务详情
    this.app.get('/api/tasks/:id', (req, res) => {
      if (!this.gate) {
        return res.status(503).json({ error: 'Node not initialized' });
      }
      const tasks = this.gate.getTasks();
      const task = tasks.find(t => t.id === req.params.id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json(task.toJSON());
    });
    
    // 承接任务
    this.app.post('/api/tasks/:id/accept', async (req, res) => {
      try {
        const task = await this.gate.acceptTask(req.params.id);
        res.json(task.toJSON());
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    });
    
    // 提交任务
    this.app.post('/api/tasks/:id/submit', async (req, res) => {
      try {
        const task = await this.gate.submitTask(req.params.id, req.body.delivery);
        res.json(task.toJSON());
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    });
    
    // 验收任务
    this.app.post('/api/tasks/:id/approve', async (req, res) => {
      try {
        const task = await this.gate.approveTask(req.params.id);
        res.json(task.toJSON());
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    });
    
    // 发起争议
    this.app.post('/api/tasks/:id/dispute', async (req, res) => {
      try {
        const result = await this.gate.disputeTask(req.params.id, req.body.reason);
        res.json(result);
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    });
  }

  /**
   * 初始化节点
   */
  async initialize(options = {}) {
    this.gate = new Gate01(options);
    await this.gate.initialize();
    return this;
  }

  /**
   * 启动服务器
   */
  async start() {
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        console.log(`[API] Server started on port ${this.port}`);
        resolve(this);
      });
    });
  }
}

/**
 * 快速启动
 */
async function quickStart(options = {}) {
  const adapter = new APIAdapter(options);
  await adapter.initialize(options);
  await adapter.start();
  return adapter;
}

/**
 * SDK 封装
 */
class Gate01SDK {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
  }

  async _request(method, path, body = null) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${this.baseUrl}${path}`, options);
    return response.json();
  }

  // 获取状态
  async getStatus() {
    return this._request('GET', '/api/status');
  }

  // 创建任务
  async createTask(task) {
    return this._request('POST', '/api/tasks', task);
  }

  // 获取任务列表
  async getTasks(filter = {}) {
    const query = new URLSearchParams(filter).toString();
    return this._request('GET', `/api/tasks?${query}`);
  }

  // 获取任务详情
  async getTask(taskId) {
    return this._request('GET', `/api/tasks/${taskId}`);
  }

  // 承接任务
  async acceptTask(taskId) {
    return this._request('POST', `/api/tasks/${taskId}/accept`);
  }

  // 提交任务
  async submitTask(taskId, delivery) {
    return this._request('POST', `/api/tasks/${taskId}/submit`, { delivery });
  }

  // 验收任务
  async approveTask(taskId) {
    return this._request('POST', `/api/tasks/${taskId}/approve`);
  }

  // 发起争议
  async disputeTask(taskId, reason) {
    return this._request('POST', `/api/tasks/${taskId}/dispute`, { reason });
  }
}

/**
 * 一键适配器 - 让现有 Agent 快速接入
 */
class OneClickAdapter {
  constructor(options = {}) {
    this.sdk = new Gate01SDK(options);
    this.config = options;
  }

  /**
   * 检测现有 Agent 环境并适配
   */
  async detectAndAdapt() {
    const env = this._detectEnvironment();
    console.log(`[Adapter] Detected environment: ${env.type}`);
    
    return {
      environment: env,
      config: this._generateConfig(env)
    };
  }

  /**
   * 检测环境
   */
  _detectEnvironment() {
    const env = {
      type: 'unknown',
      capabilities: []
    };

    // 检测 Node.js
    if (typeof process !== 'undefined' && process.versions?.node) {
      env.type = 'nodejs';
      env.capabilities.push('nodejs');
    }

    // 检测浏览器
    if (typeof window !== 'undefined') {
      env.type = 'browser';
      env.capabilities.push('browser');
    }

    // 检测 Python
    // 简化处理

    // 检测 Docker
    // 简化处理

    return env;
  }

  /**
   * 生成配置
   */
  _generateConfig(env) {
    const config = {
      endpoint: this.config.endpoint || 'http://localhost:3000',
      timeout: 30000,
      retry: 3
    };

    if (env.type === 'nodejs') {
      config.adapter = 'nodejs';
    } else if (env.type === 'browser') {
      config.adapter = 'rest';
    }

    return config;
  }

  /**
   * 快速接入
   */
  async quickConnect(agentConfig = {}) {
    const { environment, config } = await this.detectAndAdapt();
    
    // 创建 SDK 实例
    const sdk = new Gate01SDK({
      baseUrl: config.endpoint
    });

    // 测试连接
    const status = await sdk.getStatus();
    console.log(`[Adapter] Connected: ${status.running}`);

    return {
      sdk,
      environment,
      config,
      status
    };
  }
}

module.exports = {
  APIAdapter,
  Gate01SDK,
  OneClickAdapter,
  quickStart
};
