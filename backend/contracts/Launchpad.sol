// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./AmmPool.sol";
import "./EventHub.sol";
import "./LaunchToken.sol";

contract Launchpad is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant BPS_DENOMINATOR = 10_000;

    IERC20 public immutable quoteToken;
    EventHub public immutable eventHub;
    address public immutable protocolTreasury;
    uint16 public immutable poolAllocationBps;
    uint16 public immutable swapFeeBps;
    uint16 public immutable creatorFeeShareBps;
    uint256 public immutable initialQuoteLiquidity;

    mapping(address => address) public poolByToken;
    mapping(address => address) public creatorByToken;

    event TokenLaunchCreated(
        address indexed token,
        address indexed pool,
        address indexed creator,
        uint256 creatorAllocation,
        uint256 poolTokenAllocation,
        uint256 poolUsdtAllocation
    );

    constructor(
        address quoteToken_,
        address eventHub_,
        address protocolTreasury_,
        uint16 poolAllocationBps_,
        uint256 initialQuoteLiquidity_,
        uint16 swapFeeBps_,
        uint16 creatorFeeShareBps_,
        address initialOwner
    ) Ownable(initialOwner) {
        require(quoteToken_ != address(0), "Launchpad: quote token required");
        require(eventHub_ != address(0), "Launchpad: event hub required");
        require(protocolTreasury_ != address(0), "Launchpad: treasury required");
        require(poolAllocationBps_ > 0 && poolAllocationBps_ < BPS_DENOMINATOR, "Launchpad: invalid pool bps");
        require(initialQuoteLiquidity_ > 0, "Launchpad: invalid quote liquidity");
        require(swapFeeBps_ < BPS_DENOMINATOR, "Launchpad: invalid swap fee");
        require(creatorFeeShareBps_ <= BPS_DENOMINATOR, "Launchpad: invalid creator share");

        quoteToken = IERC20(quoteToken_);
        eventHub = EventHub(eventHub_);
        protocolTreasury = protocolTreasury_;
        poolAllocationBps = poolAllocationBps_;
        initialQuoteLiquidity = initialQuoteLiquidity_;
        swapFeeBps = swapFeeBps_;
        creatorFeeShareBps = creatorFeeShareBps_;
    }

    function launchToken(
        string calldata name,
        string calldata symbol,
        address creator
    ) external nonReentrant returns (address tokenAddress, address poolAddress) {
        require(creator != address(0), "Launchpad: creator required");

        LaunchToken token = new LaunchToken(name, symbol, address(this), address(this));
        uint256 totalSupply = token.FIXED_SUPPLY();
        uint256 poolTokenAllocation = (totalSupply * poolAllocationBps) / BPS_DENOMINATOR;
        uint256 creatorAllocation = totalSupply - poolTokenAllocation;

        AmmPool pool = new AmmPool(
            address(token),
            address(quoteToken),
            address(eventHub),
            address(this),
            protocolTreasury,
            creator,
            swapFeeBps,
            creatorFeeShareBps
        );

        tokenAddress = address(token);
        poolAddress = address(pool);
        poolByToken[tokenAddress] = poolAddress;
        creatorByToken[tokenAddress] = creator;

        eventHub.registerPool(poolAddress);

        token.transfer(creator, creatorAllocation);
        token.transfer(poolAddress, poolTokenAllocation);
        quoteToken.safeTransferFrom(msg.sender, poolAddress, initialQuoteLiquidity);

        pool.initialize(poolTokenAllocation, initialQuoteLiquidity);
        token.renounceOwnership();

        uint256 initialPriceQuoteE18 = pool.currentPriceQuoteE18();
        eventHub.emitTokenLaunched(
            tokenAddress,
            poolAddress,
            creator,
            totalSupply,
            creatorAllocation,
            poolTokenAllocation,
            initialQuoteLiquidity,
            initialPriceQuoteE18
        );

        emit TokenLaunchCreated(
            tokenAddress,
            poolAddress,
            creator,
            creatorAllocation,
            poolTokenAllocation,
            initialQuoteLiquidity
        );
    }
}
