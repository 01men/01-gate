// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * 01门 - 状态通道结算合约
 * 支持即时支付、争议处理、仲裁集成
 */
contract StateChannelSettlement {
    
    // 状态通道结构
    struct Channel {
        address requester;
        address acceptor;
        uint256 amount;
        string state;        // open, contested, closed
        uint256 balanceRequester;
        uint256 balanceAcceptor;
        uint256 lastUpdate;
        bytes requesterSig;
        bytes acceptorSig;
    }
    
    // 映射: channelId -> Channel
    mapping(bytes32 => Channel) public channels;
    
    // 争议映射
    mapping(bytes32 => Dispute) public disputes;
    
    // 事件
    event ChannelOpened(bytes32 indexed channelId, address requester, address acceptor, uint256 amount);
    event ChannelUpdated(bytes32 indexed channelId, uint256 balanceRequester, uint256 balanceAcceptor);
    event ChannelClosed(bytes32 indexed channelId, uint256 requesterAmount, uint256 acceptorAmount);
    event ChannelContested(bytes32 indexed channelId, string reason);
    event ChannelResolved(bytes32 indexed channelId, uint256 requesterAmount, uint256 acceptorAmount);
    event NodeFlagged(address indexed node, string reason);
    
    // 争议结构
    struct Dispute {
        address disputer;
        string reason;
        uint256 timestamp;
        bool resolved;
        uint256 rulingRequesterAmount;
        uint256 rulingAcceptorAmount;
    }
    
    // 信誉系统接口
    ReputationInterface public reputationContract;
    
    constructor(address _reputationContract) {
        reputationContract = ReputationInterface(_reputationContract);
    }
    
    /**
     * 开启状态通道
     */
    function openChannel(address _acceptor) external payable returns (bytes32) {
        bytes32 channelId = keccak256(abi.encodePacked(
            msg.sender,
            _acceptor,
            msg.value,
            block.timestamp
        ));
        
        require(channels[channelId].requester == address(0), "Channel already exists");
        
        channels[channelId] = Channel({
            requester: msg.sender,
            acceptor: _acceptor,
            amount: msg.value,
            state: "open",
            balanceRequester: msg.value,
            balanceAcceptor: 0,
            lastUpdate: block.timestamp,
            requesterSig: "",
            acceptorSig: ""
        });
        
        emit ChannelOpened(channelId, msg.sender, _acceptor, msg.value);
        
        return channelId;
    }
    
    /**
     * 更新通道状态（双方签名）
     */
    function updateChannel(
        bytes32 channelId,
        uint256 _balanceRequester,
        uint256 _balanceAcceptor,
        bytes calldata requesterSig,
        bytes calldata acceptorSig
    ) external {
        Channel storage channel = channels[channelId];
        require(channel.requester != address(0), "Channel not found");
        require(keccak256(abi.encodePacked(channel.state)) == keccak256("open"), "Channel not open");
        
        // 验证签名
        require(verifySignature(
            keccak256(abi.encodePacked(channelId, _balanceRequester, _balanceAcceptor)),
            requesterSig,
            channel.requester
        ), "Invalid requester signature");
        
        require(verifySignature(
            keccak256(abi.encodePacked(channelId, _balanceRequester, _balanceAcceptor)),
            acceptorSig,
            channel.acceptor
        ), "Invalid acceptor signature");
        
        channel.balanceRequester = _balanceRequester;
        channel.balanceAcceptor = _balanceAcceptor;
        channel.lastUpdate = block.timestamp;
        channel.requesterSig = requesterSig;
        channel.acceptorSig = acceptorSig;
        
        emit ChannelUpdated(channelId, _balanceRequester, _balanceAcceptor);
    }
    
    /**
     * 关闭通道并结算
     */
    function closeChannel(
        bytes32 channelId,
        uint256 _balanceRequester,
        uint256 _balanceAcceptor,
        bytes calldata requesterSig,
        bytes calldata acceptorSig
    ) external {
        Channel storage channel = channels[channelId];
        require(channel.requester != address(0), "Channel not found");
        
        // 验证双方签名
        bytes32 hash = keccak256(abi.encodePacked(channelId, _balanceRequester, _balanceAcceptor));
        
        if (!verifySignature(hash, requesterSig, channel.requester) ||
            !verifySignature(hash, acceptorSig, channel.acceptor)) {
            // 如果签名无效，进入争议流程
            channel.state = "contested";
            emit ChannelContested(channelId, "Invalid signatures");
            return;
        }
        
        // 结算
        channel.state = "closed";
        
        payable(channel.requester).transfer(_balanceRequester);
        payable(channel.acceptor).transfer(_balanceAcceptor);
        
        emit ChannelClosed(channelId, _balanceRequester, _balanceAcceptor);
    }
    
    /**
     * 发起争议
     */
    function contestChannel(bytes32 channelId, string calldata reason) external {
        Channel storage channel = channels[channelId];
        require(channel.requester != address(0), "Channel not found");
        require(
            msg.sender == channel.requester || msg.sender == channel.acceptor,
            "Not authorized"
        );
        
        channel.state = "contested";
        
        disputes[channelId] = Dispute({
            disputer: msg.sender,
            reason: reason,
            timestamp: block.timestamp,
            resolved: false,
            rulingRequesterAmount: 0,
            rulingAcceptorAmount: 0
        });
        
        emit ChannelContested(channelId, reason);
    }
    
    /**
     * 解决争议（仲裁调用）
     */
    function resolveChannel(
        bytes32 channelId,
        uint256 _balanceRequester,
        uint256 _balanceAcceptor
    ) external {
        require(msg.sender == address(reputationContract), "Only仲裁合约可调用");
        
        Channel storage channel = channels[channelId];
        require(channel.requester != address(0), "Channel not found");
        
        channel.state = "closed";
        channel.balanceRequester = _balanceRequester;
        channel.balanceAcceptor = _balanceAcceptor;
        
        Dispute storage dispute = disputes[channelId];
        dispute.resolved = true;
        dispute.rulingRequesterAmount = _balanceRequester;
        dispute.rulingAcceptorAmount = _balanceAcceptor;
        
        payable(channel.requester).transfer(_balanceRequester);
        payable(channel.acceptor).transfer(_balanceAcceptor);
        
        emit ChannelResolved(channelId, _balanceRequester, _balanceAcceptor);
    }
    
    /**
     * 标记风险账户
     */
    function flagNode(address node, string calldata reason) external {
        require(msg.sender == address(reputationContract), "Only信誉合约可调用");
        emit NodeFlagged(node, reason);
    }
    
    /**
     * 验证签名
     */
    function verifySignature(bytes32 hash, bytes memory sig, address signer) 
        internal 
        pure 
        returns (bool) 
    {
        if (sig.length != 65) return false;
        
        bytes32 r;
        bytes32 s;
        uint8 v;
        
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        
        return ecrecover(hash, v, r, s) == signer;
    }
    
    /**
     * 获取通道详情
     */
    function getChannel(bytes32 channelId) external view returns (
        address requester,
        address acceptor,
        uint256 amount,
        string memory state,
        uint256 balanceRequester,
        uint256 balanceAcceptor
    ) {
        Channel storage channel = channels[channelId];
        return (
            channel.requester,
            channel.acceptor,
            channel.amount,
            channel.state,
            channel.balanceRequester,
            channel.balanceAcceptor
        );
    }
}

/**
 * 信誉合约接口
 */
interface ReputationInterface {
    function updateReputation(address node, int256 delta, string memory reason) external;
    function getReputation(address node) external view returns (int256);
    function isFlagged(address node) external view returns (bool);
    function flagNode(address node, string memory reason) external;
}
