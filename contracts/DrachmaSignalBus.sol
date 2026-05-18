// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDrachmaVault {
    function agent() external view returns (address);
    function reserveScore() external view returns (uint16);
}

contract DrachmaSignalBus {
    uint8 public constant SIG_EURC_SPREAD     = 0;
    uint8 public constant SIG_USYC_NAV        = 1;
    uint8 public constant SIG_STABLFX_THIN    = 2;
    uint8 public constant SIG_DEPEG_CRITICAL  = 3;
    uint8 public constant SIG_MACRO_ALERT     = 4;
    uint8 public constant SIG_YIELD_SPIKE     = 5;

    uint256 public constant CONSENSUS_WINDOW    = 30 minutes;
    uint256 public constant CONSENSUS_THRESHOLD = 3;
    uint256 public constant COOLDOWN_PERIOD     = 10 minutes;

    struct Signal {
        address vault;
        address agent;
        uint8   signalType;
        int32   value;
        uint48  timestamp;
        uint16  vaultScore;
    }

    struct ConsensusEvent {
        uint8   signalType;
        int32   weightedAvgValue;
        uint256 vaultCount;
        address[] contributingVaults;
        uint48  timestamp;
    }

    address public owner;
    address public factory;

    mapping(address => bool)    public registeredVaults;
    mapping(address => address) public vaultToAgent;
    mapping(address => bool)    public agentToRegistered;

    Signal[]         public signals;
    ConsensusEvent[] public consensusHistory;

    mapping(uint8 => uint48) public lastConsensusAt;

    address[] public subscribers;
    mapping(address => bool) public isSubscriber;

    event VaultRegistered(address indexed vault, address indexed agent);
    event SignalSubmitted(address indexed vault, uint8 indexed signalType, int32 value, uint48 timestamp);
    event ConsensusReached(uint8 indexed signalType, int32 weightedAvgValue, uint256 vaultCount, uint256 indexed consensusIndex, uint48 timestamp);
    event SubscriberAdded(address indexed vault);

    modifier onlyOwner()   { require(msg.sender == owner,   "not owner");   _; }
    modifier onlyFactory() { require(msg.sender == factory, "not factory"); _; }

    constructor() {
        owner = msg.sender;
    }

    function setFactory(address _factory) external onlyOwner {
        factory = _factory;
    }

    function registerVault(address vault, address agent) external onlyFactory {
        require(!registeredVaults[vault], "already registered");
        registeredVaults[vault] = true;
        vaultToAgent[vault] = agent;
        agentToRegistered[agent] = true;
        emit VaultRegistered(vault, agent);
    }

    function subscribe(address vault) external {
        require(registeredVaults[vault], "vault not registered");
        require(msg.sender == vaultToAgent[vault], "only vault agent");
        if (!isSubscriber[vault]) {
            isSubscriber[vault] = true;
            subscribers.push(vault);
            emit SubscriberAdded(vault);
        }
    }

    function submitSignal(uint8 signalType, int32 value) external {
        require(agentToRegistered[msg.sender], "unregistered agent");
        address vault = _agentToVault(msg.sender);
        require(vault != address(0), "vault not found");

        uint16 score = 0;
        try IDrachmaVault(vault).reserveScore() returns (uint16 s) { score = s; }
        catch {}

        signals.push(Signal({
            vault:      vault,
            agent:      msg.sender,
            signalType: signalType,
            value:      value,
            timestamp:  uint48(block.timestamp),
            vaultScore: score
        }));

        emit SignalSubmitted(vault, signalType, value, uint48(block.timestamp));
        _checkConsensus(signalType);
    }

    function _checkConsensus(uint8 signalType) internal {
        if (block.timestamp < uint256(lastConsensusAt[signalType]) + COOLDOWN_PERIOD) return;

        uint256 cutoff = block.timestamp - CONSENSUS_WINDOW;
        uint256 count = 0;
        int256  weightedSum = 0;
        uint256 totalWeight = 0;
        address[] memory contrib = new address[](signals.length);

        for (uint i = signals.length; i > 0; i--) {
            Signal memory s = signals[i - 1];
            if (s.timestamp < cutoff) break;
            if (s.signalType != signalType) continue;

            bool duplicate = false;
            for (uint j = 0; j < count; j++) {
                if (contrib[j] == s.vault) { duplicate = true; break; }
            }
            if (duplicate) continue;

            contrib[count] = s.vault;
            uint256 weight = uint256(s.vaultScore > 0 ? s.vaultScore : 100);
            weightedSum += int256(s.value) * int256(weight);
            totalWeight += weight;
            count++;
        }

        if (count < CONSENSUS_THRESHOLD) return;

        int32 avgValue = int32(weightedSum / int256(totalWeight));
        address[] memory trimmed = new address[](count);
        for (uint i = 0; i < count; i++) trimmed[i] = contrib[i];

        consensusHistory.push(ConsensusEvent({
            signalType:        signalType,
            weightedAvgValue:  avgValue,
            vaultCount:        count,
            contributingVaults: trimmed,
            timestamp:         uint48(block.timestamp)
        }));

        lastConsensusAt[signalType] = uint48(block.timestamp);

        emit ConsensusReached(signalType, avgValue, count, consensusHistory.length - 1, uint48(block.timestamp));
    }

    function getRecentSignals(uint8 signalType, uint256 windowSecs)
        external view returns (Signal[] memory)
    {
        uint256 cutoff = block.timestamp - windowSecs;
        uint256 matchCount = 0;
        for (uint i = 0; i < signals.length; i++) {
            if (signals[i].signalType == signalType && signals[i].timestamp >= cutoff) matchCount++;
        }
        Signal[] memory result = new Signal[](matchCount);
        uint256 idx = 0;
        for (uint i = 0; i < signals.length; i++) {
            if (signals[i].signalType == signalType && signals[i].timestamp >= cutoff) {
                result[idx++] = signals[i];
            }
        }
        return result;
    }

    function getConsensusHistory() external view returns (ConsensusEvent[] memory) {
        return consensusHistory;
    }

    function totalSignals() external view returns (uint256) { return signals.length; }
    function totalConsensusEvents() external view returns (uint256) { return consensusHistory.length; }
    function registeredVaultCount() external view returns (uint256) { return subscribers.length; }

    function _agentToVault(address agent) internal view returns (address) {
        for (uint i = 0; i < subscribers.length; i++) {
            if (vaultToAgent[subscribers[i]] == agent) return subscribers[i];
        }
        return address(0);
    }
}
