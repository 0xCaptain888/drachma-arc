// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IUSDC {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract MockUSYC {
    string public name = "Mock USYC";
    string public symbol = "USYC";
    uint8  public decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public usdc;
    uint256 public navPerShare = 1.02e18; // 1 share = 1.02 USDC

    constructor(address _usdc) { usdc = _usdc; }

    function setNavPerShare(uint256 _nav) external { navPerShare = _nav; }

    function deposit(uint256 usdcAmount) external returns (uint256 shares) {
        IUSDC(usdc).transferFrom(msg.sender, address(this), usdcAmount);
        shares = usdcAmount * 1e18 / navPerShare;
        balanceOf[msg.sender] += shares;
        totalSupply += shares;
    }

    function redeem(uint256 shares) external returns (uint256 usdcAmount) {
        require(balanceOf[msg.sender] >= shares, "insufficient shares");
        usdcAmount = shares * navPerShare / 1e18;
        balanceOf[msg.sender] -= shares;
        totalSupply -= shares;
        IUSDC(usdc).transfer(msg.sender, usdcAmount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "not approved");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
