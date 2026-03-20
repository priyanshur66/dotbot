// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract LaunchToken is ERC20, Ownable {
    uint8 public constant TOKEN_DECIMALS = 18;
    uint256 public constant FIXED_SUPPLY = 1_000_000_000 * 10 ** TOKEN_DECIMALS;

    constructor(
        string memory name_,
        string memory symbol_,
        address initialHolder,
        address initialOwner
    ) ERC20(name_, symbol_) Ownable(initialOwner) {
        require(initialHolder != address(0), "LaunchToken: holder required");
        _mint(initialHolder, FIXED_SUPPLY);
    }

    function decimals() public pure override returns (uint8) {
        return TOKEN_DECIMALS;
    }
}
