import hre, { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { CustomToken, CustomTokenFactory, PresaleFactory, VestingFactory, WhitelistFactory } from "../typechain";
import { getLatestBlockTimestamp } from "../test/helpers";

const verifyQueue: {
    address: string;
    constructorArguments: any;
}[] = [];

function addToVerifyQueue(address: string, constructorArguments: any) {
    verifyQueue.push({ address, constructorArguments });
}

async function deployCustomToken(name: string, symbol: string, totalSupply: BigNumber) {
    const customTokenFactory = <CustomTokenFactory>await ethers.getContractFactory("CustomToken");
    const customToken = await customTokenFactory.deploy(name, symbol, totalSupply);
    await customToken.deployed();
    addToVerifyQueue(customToken.address, [ name, symbol, totalSupply ]);
    return customToken;
}

async function deployProject(owners: string[], vestingParams: any, rewardToken: CustomToken, addresses: any, presaleParams: any) {
    // whitelist
    const whitelistFactory = <WhitelistFactory>await ethers.getContractFactory("Whitelist");
    const whitelist = await whitelistFactory.deploy(owners);
    await whitelist.deployed();

    // vesting
    const vestingFactory = <VestingFactory>await ethers.getContractFactory("Vesting");
    const vesting = await vestingFactory.deploy(rewardToken.address, vestingParams);
    await vesting.deployed();

    // presale
    const presaleFactory = <PresaleFactory>await ethers.getContractFactory("Presale");
    const presale = await presaleFactory.deploy({
        ...addresses,
        whitelist: whitelist.address,
        vesting: vesting.address
    }, presaleParams, owners);
    await presale.deployed();

    // vesting starts after presale ends
    const vestingStartTime = presaleParams.startTime + presaleParams.period;
    await vesting.setStartTime(vestingStartTime);

    await vesting.init(presale.address);

    addToVerifyQueue(whitelist.address, [ [...owners] ]);
    addToVerifyQueue(vesting.address, [ rewardToken.address, { ...vestingParams} ]);
    addToVerifyQueue(presale.address, [ {...addresses, whitelist: whitelist.address, vesting: vesting.address}, {...presaleParams}, [...owners] ]);

    return { whitelist, vesting, presale }
}

async function main() {
    const initialOwners = ["0x70c2D3864b280748ac06c164608013D12CE1d574", "0xaC280999C0a97D7Ceb5407b6A35e424A2DeDeD94"];
    const totalUSDCSupply = ethers.utils.parseUnits("1145188782.215577", 18);
    const totalTokenSupply = ethers.utils.parseUnits("1000000000000", 18);
    
    const testFlameAmount = ethers.utils.parseUnits("1000000", 18);
    const testRewardAmount = ethers.utils.parseUnits("10000000", 18);

    // const mockUSDC = <CustomToken>await ethers.getContractAt("CustomToken", "0x956bD13917b5D09d14F1158bb57E56BF5154fe66");
    // const flameToken = <CustomToken>await ethers.getContractAt("CustomToken", "0x10b51f80Caa52e55EE34194a9336D809df680983");
    // const rewardToken1 = <CustomToken>await ethers.getContractAt("CustomToken", "0xD5D9Bc42CEE2E60290646bac3258567F33014FA4");
    // const rewardToken2 = <CustomToken>await ethers.getContractAt("CustomToken", "0x4443E5a8Bac5B07A4b53DFD7bddeeE60F0E22903");
    // const rewardToken3 = <CustomToken>await ethers.getContractAt("CustomToken", "0x409BB04a8D7d958b88B53Ac304b097Aadd267b41");

    const mockUSDC = await deployCustomToken("Mock USDC", "USDC", totalUSDCSupply);
    const flameToken = await deployCustomToken("Flame token", "FLAME", totalTokenSupply);
    const rewardToken1 = await deployCustomToken("Reward token 1", "RToken1", totalTokenSupply);
    const rewardToken2 = await deployCustomToken("Reward token 2", "RToken2", totalTokenSupply);
    const rewardToken3 = await deployCustomToken("Reward token 3", "RToken3", totalTokenSupply);

    // add also some test tokens to `0x4FB2bb19Df86feF113b2016E051898065f963CC5` and `0x4FB2bb19Df86feF113b2016E051898065f963CC5`
    await mockUSDC.transfer("0x4FB2bb19Df86feF113b2016E051898065f963CC5", testFlameAmount);
    await flameToken.transfer("0x4FB2bb19Df86feF113b2016E051898065f963CC5", testRewardAmount);
    await rewardToken1.transfer("0x4FB2bb19Df86feF113b2016E051898065f963CC5", testRewardAmount);
    await rewardToken2.transfer("0x4FB2bb19Df86feF113b2016E051898065f963CC5", testRewardAmount);
    await rewardToken3.transfer("0x4FB2bb19Df86feF113b2016E051898065f963CC5", testRewardAmount);

    const timestamp = await getLatestBlockTimestamp();

    const vestingParams = {
        vestingName: "FireStarter Presale",
        amountToBeVested: totalTokenSupply.div(5),
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
        rate: "45000", // 1 Flame = 0.045 USD
        startTime: timestamp + 86400, // tomorrow
        period: 86400 * 7, // 1 week,
        serviceFee: "50000", // 5%,
        goalFunds: "10000000", // just placholder we can ignore for now,
        initalRewardsAmount: totalTokenSupply.div(5) // 10k tokens will be deposited to vesting
    };
    const firestarter = await deployProject(initialOwners, vestingParams, flameToken, addresses, presaleParams);
    await flameToken.transfer(firestarter.vesting.address, totalTokenSupply.div(5));

    vestingParams.vestingName = "Presale";
    addresses.rewardToken = rewardToken1.address;
    presaleParams.startTime = timestamp + 86400;
    const project1 = await deployProject(initialOwners, vestingParams, rewardToken1, addresses, presaleParams);
    await project1.whitelist.addToWhitelist([{
        wallet: "0x4FB2bb19Df86feF113b2016E051898065f963CC5",
        isKycPassed: true,
        MAX_ALLOC: ethers.utils.parseUnits("10000000", 18)
    }])
    await rewardToken1.transfer(project1.vesting.address, totalTokenSupply.div(5));

    addresses.rewardToken = rewardToken2.address;
    presaleParams.startTime = timestamp;
    const project2 = await deployProject(initialOwners, vestingParams, rewardToken2, addresses, presaleParams);
    await project2.whitelist.addToWhitelist([{
        wallet: "0x4FB2bb19Df86feF113b2016E051898065f963CC5",
        isKycPassed: true,
        MAX_ALLOC: ethers.utils.parseUnits("10000000", 18)
    }])
    await rewardToken2.transfer(project2.vesting.address, totalTokenSupply.div(5));

    addresses.rewardToken = rewardToken3.address;
    presaleParams.startTime = timestamp + 86400;
    const project3 = await deployProject(initialOwners, vestingParams, rewardToken3, addresses, presaleParams);
    await rewardToken3.transfer(project3.vesting.address, totalTokenSupply.div(5));

    console.log("USDC:", mockUSDC.address);
    console.log("FLAME:", flameToken.address);
    console.log("RToken1:", rewardToken1.address);
    console.log("RToken2:", rewardToken2.address);
    console.log("RToken3:", rewardToken3.address);
    console.log("Firestarter");
    console.log("Whitelist:", firestarter.whitelist.address);
    console.log("Vesting:", firestarter.vesting.address);
    console.log("Presale:", firestarter.presale.address);
    console.log("Project 1");
    console.log("Whitelist:", project1.whitelist.address);
    console.log("Vesting:", project1.vesting.address);
    console.log("Presale:", project1.presale.address);
    console.log("Project 2");
    console.log("Whitelist:", project2.whitelist.address);
    console.log("Vesting:", project2.vesting.address);
    console.log("Presale:", project2.presale.address);
    console.log("Project 3");
    console.log("Whitelist:", project3.whitelist.address);
    console.log("Vesting:", project3.vesting.address);
    console.log("Presale:", project3.presale.address);

    // wait for 1 mins before all blocks confirmed
    await new Promise((resolve: (...args: any[]) => void) => setTimeout(resolve, 60000));

    // process verifying queue
    for (let i = 0; i < verifyQueue.length; i+=1) {
        // eslint-disable-next-line no-await-in-loop
        await hre.run("verify:verify", verifyQueue[i]);
    }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.log(verifyQueue);
    console.error(error);
    process.exit(1);
  });
