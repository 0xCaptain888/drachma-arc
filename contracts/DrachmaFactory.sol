// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./DrachmaVault.sol";
import "./DrachmaSignalBus.sol";
import "./DrachmaScoreOracle.sol";

contract DrachmaFactory {
    address public immutable signalBus;
    address public immutable scoreOracle;
    address public immutable usdc;
    address public immutable eurc;
    address public immutable usyc;
    address public immutable stableFx;
    address public owner;

    address[] public allVaults;
    mapping(address => address[]) public ownerVaults;

    event VaultCreated(address indexed vault, address indexed vaultOwner, address indexed agent, uint256 vaultIndex);

    constructor(
        address _signalBus,
        address _scoreOracle,
        address _usdc,
        address _eurc,
        address _usyc,
        address _stableFx
    ) {
        signalBus   = _signalBus;
        scoreOracle = _scoreOracle;
        usdc        = _usdc;
        eurc        = _eurc;
        usyc        = _usyc;
        stableFx    = _stableFx;
        owner       = msg.sender;
    }

    function createVault(
        address agent,
        uint16 usdcMin, uint16 usdcMax,
        uint16 eurcMin, uint16 eurcMax,
        uint16 usycMin, uint16 usycMax
    ) external returns (address vault) {
        DrachmaVault v = new DrachmaVault(agent, signalBus, scoreOracle, usdc, eurc, usyc, stableFx);
        vault = address(v);

        // Apply custom bands if provided (non-default check)
        if (usdcMin > 0 || eurcMin > 0 || usycMin > 0) {
            v.updateBands(DrachmaVault.AllocationBands(
                usdcMin, usdcMax, eurcMin, eurcMax, usycMin, usycMax
            ));
        }

        // Transfer ownership to the caller
        v.transferOwnership(msg.sender);

        // Register with SignalBus and ScoreOracle
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
