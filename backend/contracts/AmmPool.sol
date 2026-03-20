// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./EventHub.sol";

contract AmmPool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant BPS_DENOMINATOR = 10_000;
    uint256 private constant PRICE_SCALE = 1e18;

    IERC20 public immutable launchToken;
    IERC20 public immutable quoteToken;
    EventHub public immutable eventHub;
    address public immutable launchpad;
    address public immutable protocolTreasury;
    address public immutable creator;
    uint16 public immutable swapFeeBps;
    uint16 public immutable creatorFeeShareBps;
    uint8 public immutable tokenDecimals;
    uint8 public immutable quoteDecimals;

    uint256 public reserveToken;
    uint256 public reserveQuote;
    bool public initialized;

    uint256 public cumulativeCreatorFeesToken;
    uint256 public cumulativeProtocolFeesToken;
    uint256 public cumulativeCreatorFeesQuote;
    uint256 public cumulativeProtocolFeesQuote;

    error PoolAlreadyInitialized();
    error PoolNotInitialized();
    error InsufficientOutputAmount();
    error InvalidCaller();
    error InvalidLiquidity();

    constructor(
        address launchToken_,
        address quoteToken_,
        address eventHub_,
        address launchpad_,
        address protocolTreasury_,
        address creator_,
        uint16 swapFeeBps_,
        uint16 creatorFeeShareBps_
    ) {
        require(launchToken_ != address(0), "AmmPool: token required");
        require(quoteToken_ != address(0), "AmmPool: quote required");
        require(eventHub_ != address(0), "AmmPool: event hub required");
        require(launchpad_ != address(0), "AmmPool: launchpad required");
        require(protocolTreasury_ != address(0), "AmmPool: treasury required");
        require(creator_ != address(0), "AmmPool: creator required");
        require(swapFeeBps_ < BPS_DENOMINATOR, "AmmPool: invalid fee");
        require(creatorFeeShareBps_ <= BPS_DENOMINATOR, "AmmPool: invalid creator fee");

        launchToken = IERC20(launchToken_);
        quoteToken = IERC20(quoteToken_);
        eventHub = EventHub(eventHub_);
        launchpad = launchpad_;
        protocolTreasury = protocolTreasury_;
        creator = creator_;
        swapFeeBps = swapFeeBps_;
        creatorFeeShareBps = creatorFeeShareBps_;
        tokenDecimals = IERC20Metadata(launchToken_).decimals();
        quoteDecimals = IERC20Metadata(quoteToken_).decimals();
    }

    modifier onlyLaunchpad() {
        if (msg.sender != launchpad) {
            revert InvalidCaller();
        }
        _;
    }

    function initialize(uint256 tokenAmount, uint256 quoteAmount) external onlyLaunchpad {
        if (initialized) {
            revert PoolAlreadyInitialized();
        }
        if (tokenAmount == 0 || quoteAmount == 0) {
            revert InvalidLiquidity();
        }

        reserveToken = tokenAmount;
        reserveQuote = quoteAmount;
        initialized = true;

        eventHub.emitLiquidityInitialized(
            address(launchToken),
            address(this),
            reserveToken,
            reserveQuote,
            currentPriceQuoteE18()
        );
    }

    function currentPriceQuoteE18() public view returns (uint256) {
        if (reserveToken == 0) {
            return 0;
        }

        uint256 scaledQuote = reserveQuote * PRICE_SCALE * (10 ** uint256(tokenDecimals));
        return scaledQuote / reserveToken / (10 ** uint256(quoteDecimals));
    }

    function getAmountOutForQuoteIn(uint256 quoteAmountIn) public view returns (uint256) {
        if (!initialized) {
            revert PoolNotInitialized();
        }
        uint256 netQuoteIn = quoteAmountIn - _feeAmount(quoteAmountIn);
        return (reserveToken * netQuoteIn) / (reserveQuote + netQuoteIn);
    }

    function getAmountOutForTokenIn(uint256 tokenAmountIn) public view returns (uint256) {
        if (!initialized) {
            revert PoolNotInitialized();
        }
        uint256 netTokenIn = tokenAmountIn - _feeAmount(tokenAmountIn);
        return (reserveQuote * netTokenIn) / (reserveToken + netTokenIn);
    }

    function swapExactQuoteForToken(
        uint256 quoteAmountIn,
        uint256 minTokenOut,
        address recipient
    ) external nonReentrant returns (uint256 tokenAmountOut) {
        if (!initialized) {
            revert PoolNotInitialized();
        }
        require(recipient != address(0), "AmmPool: recipient required");

        quoteToken.safeTransferFrom(msg.sender, address(this), quoteAmountIn);

        uint256 totalFee = _feeAmount(quoteAmountIn);
        uint256 creatorFee = (totalFee * creatorFeeShareBps) / BPS_DENOMINATOR;
        uint256 protocolFee = totalFee - creatorFee;
        uint256 netQuoteIn = quoteAmountIn - totalFee;

        tokenAmountOut = (reserveToken * netQuoteIn) / (reserveQuote + netQuoteIn);
        if (tokenAmountOut < minTokenOut || tokenAmountOut == 0 || tokenAmountOut >= reserveToken) {
            revert InsufficientOutputAmount();
        }

        reserveQuote += netQuoteIn;
        reserveToken -= tokenAmountOut;

        _distributeQuoteFees(creatorFee, protocolFee);
        launchToken.safeTransfer(recipient, tokenAmountOut);

        _emitTrade(msg.sender, true, quoteAmountIn, tokenAmountOut, totalFee);
        return tokenAmountOut;
    }

    function swapExactTokenForQuote(
        uint256 tokenAmountIn,
        uint256 minQuoteOut,
        address recipient
    ) external nonReentrant returns (uint256 quoteAmountOut) {
        if (!initialized) {
            revert PoolNotInitialized();
        }
        require(recipient != address(0), "AmmPool: recipient required");

        launchToken.safeTransferFrom(msg.sender, address(this), tokenAmountIn);

        uint256 totalFee = _feeAmount(tokenAmountIn);
        uint256 creatorFee = (totalFee * creatorFeeShareBps) / BPS_DENOMINATOR;
        uint256 protocolFee = totalFee - creatorFee;
        uint256 netTokenIn = tokenAmountIn - totalFee;

        quoteAmountOut = (reserveQuote * netTokenIn) / (reserveToken + netTokenIn);
        if (quoteAmountOut < minQuoteOut || quoteAmountOut == 0 || quoteAmountOut >= reserveQuote) {
            revert InsufficientOutputAmount();
        }

        reserveToken += netTokenIn;
        reserveQuote -= quoteAmountOut;

        _distributeTokenFees(creatorFee, protocolFee);
        quoteToken.safeTransfer(recipient, quoteAmountOut);

        _emitTrade(msg.sender, false, tokenAmountIn, quoteAmountOut, totalFee);
        return quoteAmountOut;
    }

    function _feeAmount(uint256 amount) private view returns (uint256) {
        return (amount * swapFeeBps) / BPS_DENOMINATOR;
    }

    function _distributeQuoteFees(uint256 creatorFee, uint256 protocolFee) private {
        if (creatorFee > 0) {
            cumulativeCreatorFeesQuote += creatorFee;
            quoteToken.safeTransfer(creator, creatorFee);
        }
        if (protocolFee > 0) {
            cumulativeProtocolFeesQuote += protocolFee;
            quoteToken.safeTransfer(protocolTreasury, protocolFee);
        }

        if (creatorFee > 0 || protocolFee > 0) {
            eventHub.emitFeesDistributed(
                address(launchToken),
                address(this),
                address(quoteToken),
                creatorFee,
                protocolFee,
                cumulativeCreatorFeesQuote,
                cumulativeProtocolFeesQuote
            );
        }
    }

    function _distributeTokenFees(uint256 creatorFee, uint256 protocolFee) private {
        if (creatorFee > 0) {
            cumulativeCreatorFeesToken += creatorFee;
            launchToken.safeTransfer(creator, creatorFee);
        }
        if (protocolFee > 0) {
            cumulativeProtocolFeesToken += protocolFee;
            launchToken.safeTransfer(protocolTreasury, protocolFee);
        }

        if (creatorFee > 0 || protocolFee > 0) {
            eventHub.emitFeesDistributed(
                address(launchToken),
                address(this),
                address(launchToken),
                creatorFee,
                protocolFee,
                cumulativeCreatorFeesToken,
                cumulativeProtocolFeesToken
            );
        }
    }

    function _emitTrade(
        address trader,
        bool isBuy,
        uint256 amountIn,
        uint256 amountOut,
        uint256 feeAmount
    ) private {
        eventHub.emitSwapExecuted(
            address(launchToken),
            address(this),
            trader,
            isBuy,
            amountIn,
            amountOut,
            feeAmount,
            currentPriceQuoteE18(),
            reserveToken,
            reserveQuote
        );
    }
}
