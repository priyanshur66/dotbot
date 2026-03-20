// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract EventHub is Ownable {
    address public launchpad;
    mapping(address => bool) public registeredPools;

    event LaunchpadConfigured(address indexed launchpad);
    event PoolRegistered(address indexed pool);

    event TokenLaunched(
        address indexed token,
        address indexed pool,
        address indexed creator,
        uint256 totalSupply,
        uint256 creatorAllocation,
        uint256 poolTokenAllocation,
        uint256 poolUsdtAllocation,
        uint256 initialPriceQuoteE18
    );

    event LiquidityInitialized(
        address indexed token,
        address indexed pool,
        uint256 reserveToken,
        uint256 reserveUsdt,
        uint256 initialPriceQuoteE18
    );

    event SwapExecuted(
        address indexed token,
        address indexed pool,
        address indexed trader,
        bool isBuy,
        uint256 amountIn,
        uint256 amountOut,
        uint256 feeAmount,
        uint256 priceQuoteE18,
        uint256 reserveTokenAfter,
        uint256 reserveUsdtAfter
    );

    event FeesDistributed(
        address indexed token,
        address indexed pool,
        address indexed feeAsset,
        uint256 creatorFeeAmount,
        uint256 protocolFeeAmount,
        uint256 creatorFeesTotal,
        uint256 protocolFeesTotal
    );

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyAuthorizedEmitter() {
        require(
            msg.sender == launchpad || registeredPools[msg.sender],
            "EventHub: emitter not authorized"
        );
        _;
    }

    function setLaunchpad(address launchpad_) external onlyOwner {
        require(launchpad_ != address(0), "EventHub: launchpad required");
        launchpad = launchpad_;
        emit LaunchpadConfigured(launchpad_);
    }

    function registerPool(address pool) external {
        require(msg.sender == launchpad, "EventHub: only launchpad");
        require(pool != address(0), "EventHub: pool required");
        registeredPools[pool] = true;
        emit PoolRegistered(pool);
    }

    function emitTokenLaunched(
        address token,
        address pool,
        address creator,
        uint256 totalSupply,
        uint256 creatorAllocation,
        uint256 poolTokenAllocation,
        uint256 poolUsdtAllocation,
        uint256 initialPriceQuoteE18
    ) external onlyAuthorizedEmitter {
        emit TokenLaunched(
            token,
            pool,
            creator,
            totalSupply,
            creatorAllocation,
            poolTokenAllocation,
            poolUsdtAllocation,
            initialPriceQuoteE18
        );
    }

    function emitLiquidityInitialized(
        address token,
        address pool,
        uint256 reserveToken,
        uint256 reserveUsdt,
        uint256 initialPriceQuoteE18
    ) external onlyAuthorizedEmitter {
        emit LiquidityInitialized(
            token,
            pool,
            reserveToken,
            reserveUsdt,
            initialPriceQuoteE18
        );
    }

    function emitSwapExecuted(
        address token,
        address pool,
        address trader,
        bool isBuy,
        uint256 amountIn,
        uint256 amountOut,
        uint256 feeAmount,
        uint256 priceQuoteE18,
        uint256 reserveTokenAfter,
        uint256 reserveUsdtAfter
    ) external onlyAuthorizedEmitter {
        emit SwapExecuted(
            token,
            pool,
            trader,
            isBuy,
            amountIn,
            amountOut,
            feeAmount,
            priceQuoteE18,
            reserveTokenAfter,
            reserveUsdtAfter
        );
    }

    function emitFeesDistributed(
        address token,
        address pool,
        address feeAsset,
        uint256 creatorFeeAmount,
        uint256 protocolFeeAmount,
        uint256 creatorFeesTotal,
        uint256 protocolFeesTotal
    ) external onlyAuthorizedEmitter {
        emit FeesDistributed(
            token,
            pool,
            feeAsset,
            creatorFeeAmount,
            protocolFeeAmount,
            creatorFeesTotal,
            protocolFeesTotal
        );
    }
}
