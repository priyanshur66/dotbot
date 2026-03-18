// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract FixedSupplyToken is ERC20, Ownable {
    uint256 public constant FIXED_SUPPLY = 1_000_000_000 * 10 ** 18;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) Ownable(msg.sender) {
        _mint(msg.sender, FIXED_SUPPLY);
    }
}
