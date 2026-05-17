// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract MockStableFX {
    // Simplified 1:1 swap for testing purposes
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) external returns (uint256 amountOut) {
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        amountOut = amountIn;
        require(amountOut >= minAmountOut, "slippage");
        IERC20(tokenOut).transfer(msg.sender, amountOut);
    }
}
