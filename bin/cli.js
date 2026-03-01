#!/usr/bin/env node

/**
 * 01门 CLI
 * 去中心化微任务网络命令行工具
 */

const { Gate01 } = require('../src/index.js');
const { Identity } = require('../src/identity/Identity.js');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'init':
      await cmdInit();
      break;
    case 'status':
      await cmdStatus();
      break;
    case 'create-task':
      await cmdCreateTask();
      break;
    case 'list-tasks':
      await cmdListTasks();
      break;
    case 'my-identity':
      await cmdMyIdentity();
      break;
    case ' reputation':
      await cmdReputation();
      break;
    case 'help':
    default:
      showHelp();
  }
}

async function cmdInit() {
  console.log('Initializing 01 Gate node...\n');
  
  const gate = new Gate01({
    port: 0,
    role: 'agent',
    isAutoAccept: false
  });
  
  await gate.initialize();
  
  console.log('\n✅ Node initialized!');
  console.log('DID:', gate.identity.did);
  console.log('Address:', gate.identity.address);
  console.log('\nTo create a task: 01-gate create-task');
}

async function cmdStatus() {
  const dataDir = './01-gate/data';
  const identityPath = path.join(dataDir, 'identity.json');
  const tasksPath = path.join(dataDir, 'tasks.json');
  
  console.log('═══════════════════════════════════════');
  console.log('   01门 - 节点状态');
  console.log('═══════════════════════════════════════\n');
  
  if (!fs.existsSync(identityPath)) {
    console.log('❌ Node not initialized. Run: 01-gate init');
    return;
  }
  
  const identity = Identity.load(identityPath);
  console.log('DID:', identity.did);
  console.log('地址:', identity.address);
  
  if (fs.existsSync(tasksPath)) {
    const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
    console.log('\n任务统计:');
    console.log('  总数:', tasks.length);
    
    const byStatus = {};
    tasks.forEach(t => {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    });
    
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`  ${status}:`, count);
    });
  }
  
  console.log('');
}

async function cmdCreateTask() {
  const title = args.find((a, i) => args[i-1] === '--title') || 'New Task';
  const desc = args.find((a, i) => args[i-1] === '--description') || 'Task description';
  const budget = parseInt(args.find((a, i) => args[i-1] === '--budget')) || 10;
  const skills = (args.find((a, i) => args[i-1] === '--skills') || 'general').split(',');
  
  const gate = new Gate01({
    role: 'agent',
    isAutoAccept: false
  });
  
  await gate.initialize();
  
  const task = await gate.createTask({
    title,
    description: desc,
    budget,
    token: 'USDC',
    skills,
    deadline: Date.now() + 7 * 24 * 60 * 60 * 1000
  });
  
  console.log('\n✅ Task created!');
  console.log('ID:', task.id);
  console.log('标题:', task.title);
  console.log('预算:', task.budget, task.token);
}

async function cmdListTasks() {
  const dataDir = './01-gate/data';
  const tasksPath = path.join(dataDir, 'tasks.json');
  
  console.log('\n═══════════════════════════════════════');
  console.log('   任务列表');
  console.log('═══════════════════════════════════════\n');
  
  if (!fs.existsSync(tasksPath)) {
    console.log('暂无任务');
    return;
  }
  
  const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
  
  if (tasks.length === 0) {
    console.log('暂无任务');
    return;
  }
  
  tasks.forEach(t => {
    console.log(`[${t.status}] ${t.title}`);
    console.log(`   预算: ${t.budget} ${t.token} | ID: ${t.id.slice(0, 8)}...`);
    console.log('');
  });
}

async function cmdMyIdentity() {
  const identityPath = './01-gate/data/identity.json';
  
  if (!fs.existsSync(identityPath)) {
    console.log('❌ 未找到身份，请先运行: 01-gate init');
    return;
  }
  
  const identity = Identity.load(identityPath);
  
  console.log('\n═══════════════════════════════════════');
  console.log('   我的身份');
  console.log('═══════════════════════════════════════\n');
  console.log('DID:', identity.did);
  console.log('地址:', identity.address);
  console.log('公钥:', identity.publicKey);
  console.log('');
}

async function cmdReputation() {
  console.log('\n═══════════════════════════════════════');
  console.log('   信誉排名 (Top 10)');
  console.log('═══════════════════════════════════════\n');
  
  const { ReputationOracle } = require('../src/core/Reputation.js');
  const oracle = new ReputationOracle({ storagePath: './01-gate/data/reputation.json' });
  
  const leaderboard = oracle.getLeaderboard(10);
  
  if (leaderboard.length === 0) {
    console.log('暂无数据');
    return;
  }
  
  leaderboard.forEach((entry, i) => {
    console.log(`#${entry.rank} | 信誉: ${entry.score} | 任务: ${entry.tasksCompleted} | 完成率: ${(entry.completionRate * 100).toFixed(0)}%`);
    console.log(`   DID: ${entry.did}\n`);
  });
}

function showHelp() {
  console.log(`
01门 (01 Gate) - 去中心化微任务网络

使用方法:
  01-gate <命令>

命令:
  init              初始化新节点
  status            查看节点状态
  create-task       创建新任务
  list-tasks        列出所有任务
  my-identity       查看我的身份
  reputation        查看信誉排名
  help              显示帮助信息

示例:
  01-gate init
  01-gate create-task --title "翻译文档" --budget 50 --skills translation,english
  01-gate status

更多信息: https://github.com/01men/01-gate
`);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
