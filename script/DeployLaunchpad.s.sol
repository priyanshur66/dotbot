// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import {EventHub} from "../backend/contracts/EventHub.sol";
import {MockUSDT} from "../backend/contracts/MockUSDT.sol";
import {Launchpad} from "../backend/contracts/Launchpad.sol";

contract DeployLaunchpadScript is Script {
    function run() external returns (EventHub eventHub, MockUSDT mockUsdt, Launchpad launchpad) {
        string memory privateKeyRaw = vm.envString("PRIVATE_KEY");
        uint256 deployerPrivateKey = vm.parseUint(privateKeyRaw);
        address deployer = vm.addr(deployerPrivateKey);

        address protocolTreasury = vm.envOr("PROTOCOL_TREASURY_ADDRESS", deployer);
        uint16 poolAllocationBps = uint16(vm.envOr("LAUNCHPAD_POOL_ALLOCATION_BPS", uint256(8000)));
        uint16 swapFeeBps = uint16(vm.envOr("LAUNCHPAD_SWAP_FEE_BPS", uint256(100)));
        uint16 creatorFeeShareBps = uint16(vm.envOr("LAUNCHPAD_CREATOR_FEE_SHARE_BPS", uint256(5000)));
        uint256 initialQuoteLiquidity = vm.envOr(
            "LAUNCHPAD_INITIAL_USDT_LIQUIDITY_RAW",
            uint256(50_000 * 1e6)
        );
        uint256 bootstrapQuoteMintAmount = vm.envOr(
            "LAUNCHPAD_BOOTSTRAP_USDT_MINT_RAW",
            initialQuoteLiquidity * 1000
        );

        vm.startBroadcast(deployerPrivateKey);

        eventHub = new EventHub(deployer);
        mockUsdt = new MockUSDT(deployer);
        launchpad = new Launchpad(
            address(mockUsdt),
            address(eventHub),
            protocolTreasury,
            poolAllocationBps,
            initialQuoteLiquidity,
            swapFeeBps,
            creatorFeeShareBps,
            deployer
        );

        eventHub.setLaunchpad(address(launchpad));
        mockUsdt.mint(deployer, bootstrapQuoteMintAmount);
        mockUsdt.approve(address(launchpad), type(uint256).max);

        vm.stopBroadcast();

        console2.log("Deployer:", deployer);
        console2.log("EventHub:", address(eventHub));
        console2.log("MockUSDT:", address(mockUsdt));
        console2.log("Launchpad:", address(launchpad));
        console2.log("Protocol Treasury:", protocolTreasury);
        console2.log("Initial Quote Liquidity:", initialQuoteLiquidity);
        console2.log("Bootstrap Quote Mint:", bootstrapQuoteMintAmount);
        console2.log("Pool Allocation Bps:", uint256(poolAllocationBps));
        console2.log("Swap Fee Bps:", uint256(swapFeeBps));
        console2.log("Creator Fee Share Bps:", uint256(creatorFeeShareBps));

        string memory root = "launchpad";
        vm.serializeAddress(root, "deployer", deployer);
        vm.serializeAddress(root, "eventHub", address(eventHub));
        vm.serializeAddress(root, "quoteToken", address(mockUsdt));
        vm.serializeAddress(root, "launchpad", address(launchpad));
        vm.serializeAddress(root, "protocolTreasury", protocolTreasury);
        vm.serializeUint(root, "initialQuoteLiquidity", initialQuoteLiquidity);
        vm.serializeUint(root, "bootstrapQuoteMintAmount", bootstrapQuoteMintAmount);
        vm.serializeUint(root, "poolAllocationBps", uint256(poolAllocationBps));
        vm.serializeUint(root, "swapFeeBps", uint256(swapFeeBps));
        string memory json = vm.serializeUint(root, "creatorFeeShareBps", uint256(creatorFeeShareBps));
        vm.writeJson(json, "deployments/launchpad-polkadot-hub-testnet.json");
    }
}
