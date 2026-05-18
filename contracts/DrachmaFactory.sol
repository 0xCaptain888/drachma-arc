// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./DrachmaVault.sol";
import "./DrachmaSignalBus.sol";
import "./DrachmaScoreOracle.sol";

contract DrachmaFactory {
    address public immutable signalBus;
    address public immutable scoreOracle;
    address public owner;

    address[] public allVaults;
    mapping(address => address[]) public ownerVaults;

    event VaultCreated(address indexed vault, address indexed vaultOwner, address indexed agent, uint256 vaultIndex);

    constructor(address _signalBus, address _scoreOracle) {
        signalBus   = _signalBus;
        scoreOracle = _scoreOracle;
        owner       = msg.sender;
    }

    function createVault(
        address agent,
        uint16 /*usdcMin*/, uint16 /*usdcMax*/,
        uint16 /*eurcMin*/, uint16 /*eurcMax*/,
        uint16 /*usycMin*/, uint16 /*usycMax*/
    ) external returns (address vault) {
        DrachmaVault v = new DrachmaVault(agent, signalBus, scoreOracle);
        vault = address(v);

        DrachmaSignalBus(signalBus).registerVault(vault, agent);
        DrachmaScoreOracle(scoreOracle).initializeVault(vault);

        allVaults.push(vault);
        ownerVaults[msg.sender].push(vault);

        emit VaultCreated(vault, msg.sender, agent, allVaults.length - 1);
    }

    function totalVaults() external view returns (uint256) { return allVaults.length; }

    function getOwnerVaults(address _owner) external view returns (address[] memory) {
        return ownerVaults[_owner];
    }
}
