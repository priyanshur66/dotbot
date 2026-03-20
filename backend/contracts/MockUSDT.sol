// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDT is ERC20, Ownable {
    uint8 public constant TOKEN_DECIMALS = 6;

    constructor(address initialOwner) ERC20("Mock Tether USD", "USDT") Ownable(initialOwner) {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return TOKEN_DECIMALS;
    }
}
