// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * 01门 - 信誉合约
 * 链上信誉管理、风险账户标记
 */
contract Reputation {
    
    // 节点信誉
    struct NodeReputation {
        int256 score;
        uint256 taskCount;
        uint256 successCount;
        uint256 flaggedCount;
        bool isFlagged;
        string flagReason;
        uint256 lastUpdate;
        mapping(string256) skillScores;
    }
 => uint    
    // 映射: node address -> reputation
    mapping(address => NodeReputation) public reputations;
    
    // 历史记录
    mapping(address => int256[]) public reputationHistory;
    
    // 事件
    event ReputationUpdated(address indexed node, int256 newScore, string reason);
    event NodeFlagged(address indexed node, string reason);
    event NodeUnflagged(address indexed node);
    event SkillVerified(address indexed node, string skill, uint256 score);
    
    // 管理员
    address public admin;
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }
    
    constructor() {
        admin = msg.sender;
    }
    
    /**
     * 更新信誉
     */
    function updateReputation(address node, int256 delta, string memory reason) external onlyAdmin {
        NodeReputation storage rep = reputations[node];
        
        rep.score += delta;
        rep.lastUpdate = block.timestamp;
        
        // 记录历史
        reputationHistory[node].push(rep.score);
        
        emit ReputationUpdated(node, rep.score, reason);
    }
    
    /**
     * 完成任务后更新信誉
     */
    function onTaskComplete(address node, uint256 taskValue) external onlyAdmin {
        NodeReputation storage rep = reputations[node];
        
        rep.taskCount++;
        rep.successCount++;
        
        // 根据任务价值增加信誉
        int256 bonus = int256(taskValue / 100);
        rep.score += bonus;
        rep.lastUpdate = block.timestamp;
        
        reputationHistory[node].push(rep.score);
        
        emit ReputationUpdated(node, rep.score, "task_completed");
    }
    
    /**
     * 标记风险账户
     */
    function flagNode(address node, string memory reason) external onlyAdmin {
        NodeReputation storage rep = reputations[node];
        
        rep.isFlagged = true;
        rep.flagReason = reason;
        rep.flaggedCount++;
        
        // 大幅降低信誉
        rep.score -= 50;
        
        emit NodeFlagged(node, reason);
    }
    
    /**
     * 解除标记
     */
    function unflagNode(address node) external onlyAdmin {
        NodeReputation storage rep = reputations[node];
        
        rep.isFlagged = false;
        rep.flagReason = "";
        
        emit NodeUnflagged(node);
    }
    
    /**
     * 更新技能评分
     */
    function updateSkill(address node, string memory skill, uint256 score) external onlyAdmin {
        NodeReputation storage rep = reputations[node];
        rep.skillScores[skill] = score;
        
        emit SkillVerified(node, skill, score);
    }
    
    /**
     * 获取信誉
     */
    function getReputation(address node) external view returns (int256) {
        return reputations[node].score;
    }
    
    /**
     * 获取详细信誉信息
     */
    function getDetailedReputation(address node) external view returns (
        int256 score,
        uint256 taskCount,
        uint256 successCount,
        uint256 flaggedCount,
        bool isFlagged,
        string memory flagReason,
        uint256 lastUpdate
    ) {
        NodeReputation storage rep = reputations[node];
        return (
            rep.score,
            rep.taskCount,
            rep.successCount,
            rep.flaggedCount,
            rep.isFlagged,
            rep.flagReason,
            rep.lastUpdate
        );
    }
    
    /**
     * 获取技能评分
     */
    function getSkillScore(address node, string memory skill) external view returns (uint256) {
        return reputations[node].skillScores[skill];
    }
    
    /**
     * 检查是否被标记
     */
    function isFlagged(address node) external view returns (bool) {
        return reputations[node].isFlagged;
    }
    
    /**
     * 获取成功率
     */
    function getSuccessRate(address node) external view returns (uint256) {
        NodeReputation storage rep = reputations[node];
        if (rep.taskCount == 0) return 0;
        return (rep.successCount * 100) / rep.taskCount;
    }
}
