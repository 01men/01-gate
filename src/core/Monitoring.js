/**
 * 01门 - 监控模块
 * Prometheus + Grafana 集成
 */

const os = require('os');
const crypto = require('crypto');

/**
 * Prometheus 指标收集器
 */
class MetricsCollector {
  constructor(options = {}) {
    this.prefix = options.prefix || 'gate01_';
    this.metrics = {
      counters: new Map(),
      gauges: new Map(),
      histograms: new Map()
    };
    this.labels = options.labels || {};
  }

  /**
   * 创建或获取计数器
   */
  getCounter(name, help, labels = {}) {
    const key = this._getKey(name, labels);
    if (!this.metrics.counters.has(key)) {
      this.metrics.counters.set(key, {
        name: this.prefix + name,
        help,
        type: 'counter',
        value: 0,
        labels: { ...this.labels, ...labels }
      });
    }
    return this.metrics.counters.get(key);
  }

  /**
   * 创建或获取仪表
   */
  getGauge(name, help, labels = {}) {
    const key = this._getKey(name, labels);
    if (!this.metrics.gauges.has(key)) {
      this.metrics.gauges.set(key, {
        name: this.prefix + name,
        help,
        type: 'gauge',
        value: 0,
        labels: { ...this.labels, ...labels }
      });
    }
    return this.metrics.gauges.get(key);
  }

  /**
   * 创建或获取直方图
   */
  getHistogram(name, help, buckets, labels = {}) {
    const key = this._getKey(name, labels);
    if (!this.metrics.histograms.has(key)) {
      this.metrics.histograms.set(key, {
        name: this.prefix + name,
        help,
        type: 'histogram',
        buckets: buckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
        values: [],
        labels: { ...this.labels, ...labels }
      });
    }
    return this.metrics.histograms.get(key);
  }

  /**
   * 增加计数器
   */
  inc(name, value = 1, labels = {}) {
    const counter = this.getCounter(name, '', labels);
    counter.value += value;
  }

  /**
   * 设置仪表值
   */
  set(name, value, labels = {}) {
    const gauge = this.getGauge(name, '', labels);
    gauge.value = value;
  }

  /**
   * 观察直方图值
   */
  observe(name, value, labels = {}) {
    const histogram = this.getHistogram(name, '', null, labels);
    histogram.values.push(value);
  }

  /**
   * 格式化Prometheus输出
   */
  format() {
    let output = '';
    
    // 计数器
    for (const [, metric] of this.metrics.counters) {
      output += `# HELP ${metric.name} ${metric.help}\n`;
      output += `# TYPE ${metric.name} counter\n`;
      const labelStr = this._formatLabels(metric.labels);
      output += `${metric.name}${labelStr} ${metric.value}\n`;
    }
    
    // 仪表
    for (const [, metric] of this.metrics.gauges) {
      output += `# HELP ${metric.name} ${metric.help}\n`;
      output += `# TYPE ${metric.name} gauge\n`;
      const labelStr = this._formatLabels(metric.labels);
      output += `${metric.name}${labelStr} ${metric.value}\n`;
    }
    
    // 直方图
    for (const [, metric] of this.metrics.histograms) {
      output += `# HELP ${metric.name} ${metric.help}\n`;
      output += `# TYPE ${metric.name} histogram\n`;
      
      // 计算分位数
      const sorted = metric.values.sort((a, b) => a - b);
      const labelStr = this._formatLabels(metric.labels);
      
      for (const bucket of metric.buckets) {
        const count = sorted.filter(v => v <= bucket).length;
        output += `${metric.name}_bucket{${labelStr},le="${bucket}"} ${count}\n`;
      }
      
      const sum = sorted.reduce((a, b) => a + b, 0);
      output += `${metric.name}_sum${labelStr} ${sum}\n`;
      output += `${metric.name}_count${labelStr} ${sorted.length}\n`;
    }
    
    return output;
  }

  _getKey(name, labels) {
    const labelKey = Object.keys(labels).sort().map(k => `${k}:${labels[k]}`).join(',');
    return `${name}:${labelKey}`;
  }

  _formatLabels(labels) {
    if (!labels || Object.keys(labels).length === 0) return '';
    const labelStr = Object.keys(labels)
      .map(k => `${k}="${labels[k]}"`)
      .join(',');
    return `{${labelStr}}`;
  }
}

/**
 * 系统指标收集
 */
class SystemMetrics {
  constructor() {
    this.startTime = Date.now();
  }

  /**
   * 收集系统指标
   */
  collect() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    
    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      return acc + (1 - idle / total) / cpus.length;
    }, 0);

    return {
      // CPU
      cpuUsage: Math.round(cpuUsage * 100),
      cpuCount: cpus.length,
      
      // 内存
      memoryUsed: totalMem - freeMem,
      memoryTotal: totalMem,
      memoryUsagePercent: Math.round((1 - freeMem / totalMem) * 100),
      
      // 系统
      uptime: os.uptime(),
      platform: os.platform(),
      arch: os.arch(),
      
      // 进程
      processUptime: Math.floor((Date.now() - this.startTime) / 1000),
      processMemory: process.memoryUsage()
    };
  }
}

/**
 * 网络指标
 */
class NetworkMetrics {
  constructor() {
    this.tasks = {
      created: 0,
      broadcast: 0,
      accepted: 0,
      completed: 0,
      disputed: 0
    };
    this.peers = {
      current: 0,
      total: 0,
      max: 0
    };
  }

  /**
   * 记录任务事件
   */
  recordTask(event) {
    if (this.tasks[event] !== undefined) {
      this.tasks[event]++;
    }
  }

  /**
   * 更新节点数
   */
  updatePeers(count) {
    this.peers.current = count;
    this.peers.max = Math.max(this.peers.max, count);
    this.peers.total += count > 0 ? 1 : 0;
  }

  /**
   * 收集网络指标
   */
  collect() {
    return {
      tasks: { ...this.tasks },
      peers: { ...this.peers }
    };
  }
}

/**
 * 监控服务
 */
class MonitoringService {
  constructor(options = {}) {
    this.metrics = new MetricsCollector(options);
    this.system = new SystemMetrics();
    this.network = new NetworkMetrics();
    this.port = options.port || 9090;
    this.host = options.host || '127.0.0.1';
    this.server = null;
  }

  /**
   * 启动监控服务
   */
  async start() {
    const http = require('http');
    
    this.server = http.createServer(async (req, res) => {
      if (req.url === '/metrics') {
        // 更新系统指标
        this._updateSystemMetrics();
        
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(this.metrics.format());
      } else if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
      } else if (req.url === '/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          system: this.system.collect(),
          network: this.network.collect()
        }, null, 2));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });
    
    return new Promise((resolve) => {
      this.server.listen(this.port, this.host, () => {
        console.log(`[Monitor] 监控服务启动: http://${this.host}:${this.port}`);
        console.log(`[Monitor] - /metrics   - Prometheus 指标`);
        console.log(`[Monitor] - /health   - 健康检查`);
        console.log(`[Monitor] - /stats    - 详细统计`);
        resolve(this);
      });
    });
  }

  /**
   * 停止监控服务
   */
  async stop() {
    if (this.server) {
      this.server.close();
      console.log('[Monitor] 监控服务已停止');
    }
  }

  /**
   * 更新系统指标
   */
  _updateSystemMetrics() {
    const sys = this.system.collect();
    
    this.metrics.set('system_cpu_percent', sys.cpuUsage);
    this.metrics.set('system_memory_percent', sys.memoryUsagePercent);
    this.metrics.set('system_uptime_seconds', sys.uptime);
    this.metrics.set('process_uptime_seconds', sys.processUptime);
    
    const net = this.network.collect();
    this.metrics.set('network_peers_current', net.peers.current);
    this.metrics.set('network_tasks_created', net.tasks.created);
    this.metrics.set('network_tasks_completed', net.tasks.completed);
  }

  /**
   * 记录任务创建
   */
  recordTaskCreated() {
    this.metrics.inc('tasks_created_total');
    this.network.recordTask('created');
  }

  /**
   * 记录任务广播
   */
  recordTaskBroadcast() {
    this.metrics.inc('tasks_broadcast_total');
    this.network.recordTask('broadcast');
  }

  /**
   * 记录任务完成
   */
  recordTaskCompleted(duration) {
    this.metrics.inc('tasks_completed_total');
    this.metrics.observe('task_duration_seconds', duration);
    this.network.recordTask('completed');
  }

  /**
   * 更新节点数
   */
  updatePeerCount(count) {
    this.metrics.set('peers_connected', count);
    this.network.updatePeers(count);
  }
}

module.exports = {
  MetricsCollector,
  SystemMetrics,
  NetworkMetrics,
  MonitoringService
};
