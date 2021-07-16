import { ethers } from "hardhat";
import { CustomToken } from "../typechain";
import { getLatestBlockTimestamp } from "../helper/utils";
import { deployCampaign, deployContract, verifyContract } from "../helper/deployer";

async function main() {
    const initialOwners = ["0x70c2D3864b280748ac06c164608013D12CE1d574", "0xaC280999C0a97D7Ceb5407b6A35e424A2DeDeD94"];
    const totalUSDCSupply = ethers.utils.parseUnits("1145188782.215577", 18);
    const totalTokenSupply = ethers.utils.parseUnits("1000000000000", 18);
    
    const testFlameAmount = ethers.utils.parseUnits("1000000", 18);
    const testRewardAmount = ethers.utils.parseUnits("10000000", 18);
    const testVestingAmount = totalTokenSupply.div(5);

    const mockUSDC = <CustomToken>await deployContract("CustomToken", "Mock USDC", "USDC", totalUSDCSupply);
    const flameToken = <CustomToken>await deployContract("CustomToken", "Flame token", "FLAME", totalTokenSupply);
    const rewardToken = <CustomToken>await deployContract("CustomToken", "Reward token", "RToken", totalTokenSupply);
    
    console.log("USDC:", mockUSDC.address);
    console.log("FLAME:", flameToken.address);
    console.log("RToken:", rewardToken.address);

    // add also some test tokens to `0x4FB2bb19Df86feF113b2016E051898065f963CC5` and `0x4FB2bb19Df86feF113b2016E051898065f963CC5`
    await mockUSDC.transfer("0x4FB2bb19Df86feF113b2016E051898065f963CC5", testFlameAmount);
    await flameToken.transfer("0x4FB2bb19Df86feF113b2016E051898065f963CC5", testRewardAmount);
    await rewardToken.transfer("0x4FB2bb19Df86feF113b2016E051898065f963CC5", testRewardAmount);

    const timestamp = await getLatestBlockTimestamp();

    // Deploy firestarter campaign
    const vestingParams = {
        vestingName: "FireStarter Presale",
        amountToBeVested: testVestingAmount,
        initalUnlock: 2000000000, // 20%
        withdrawInterval: 60, // 1 min
        releaseRate: 372000, // release 10% every interval
        lockPeriod: 86400 * 7 * 2 // 2 weeks
    }
    const addresses = {
        fundToken: mockUSDC.address,
        rewardToken: flameToken.address,
        projectOwner: "0x70c2D3864b280748ac06c164608013D12CE1d574",
    };
    const presaleParams = {
        rate: "4500000000", // 1 Flame = 0.045 USD
        startTime: timestamp + 86400, // tomorrow
        period: 86400 * 7, // 1 week,
        serviceFee: "5000000000", // 5%,
        goalFunds: "10000000000", // just placholder we can ignore for now,
        initalRewardsAmount: testVestingAmount // 10k tokens will be deposited to vesting
    };

    const firestarter = await deployCampaign("FirestarterPresale", initialOwners, vestingParams, addresses, presaleParams);
    await flameToken.transfer(firestarter.vesting.address, testVestingAmount);

    console.log("Firestarter");
    console.log("Whitelist:", firestarter.whitelist.address);
    console.log("Vesting:", firestarter.vesting.address);
    console.log("Presale:", firestarter.presale.address);

    // Sample Project Campaign
    const vestingParams1 = {
        ...vestingParams,
        vestingName: "Presale"
    };
    const addresses1 = {
        ...addresses,
        rewardToken: rewardToken.address
    }
    const presaleParams1 = {
        ...presaleParams,
        period: 3600 * 8, // finish in 8 hours
        startTime: timestamp
    }
    const project = await deployCampaign("ProjectPresale", initialOwners, vestingParams1, addresses1, presaleParams1);
    await project.whitelist.addToWhitelist([{
        wallet: "0x4FB2bb19Df86feF113b2016E051898065f963CC5",
        isKycPassed: true,
        maxAlloc: ethers.utils.parseUnits("10000000", 18),
        allowedPrivateSale: true,
        privateMaxAlloc: ethers.utils.parseUnits("10000000", 18)
    }])
    await project.presale.endPrivateSale();
    await rewardToken.transfer(project.vesting.address, testVestingAmount);

    console.log("Project 1");
    console.log("Whitelist:", project.whitelist.address);
    console.log("Vesting:", project.vesting.address);
    console.log("Presale:", project.presale.address);

    // wait for 1 mins before all blocks confirmed
    await new Promise((resolve: (...args: any[]) => void) => setTimeout(resolve, 60000));

    await verifyContract(mockUSDC.address, "Mock USDC", "USDC", totalUSDCSupply);
    await verifyContract(flameToken.address, "Flame token", "FLAME", totalTokenSupply);
    await verifyContract(rewardToken.address, "Reward token", "RToken", totalTokenSupply);

    await verifyContract(firestarter.whitelist.address, initialOwners);
    await verifyContract(firestarter.vesting.address, addresses.rewardToken, vestingParams);
    await verifyContract(firestarter.presale.address, {
        ...addresses,
        whitelist: firestarter.whitelist.address,
        vesting: firestarter.vesting.address
    }, presaleParams, initialOwners);

    await verifyContract(project.whitelist.address, initialOwners);
    await verifyContract(project.vesting.address, addresses1.rewardToken, vestingParams1);
    await verifyContract(project.presale.address, {
        ...addresses,
        whitelist: project.whitelist.address,
        vesting: project.vesting.address
    }, presaleParams1, initialOwners);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
