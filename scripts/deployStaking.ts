import { ethers } from "hardhat";
import { CustomToken, Staking } from "../typechain";
import { duration, getBigNumber, getLatestBlockTimestamp } from "../helper/utils";
import { deployContract, deployProxy, verifyContract } from "../helper/deployer";

async function main() {
    const totalSupply = getBigNumber("100000000");
    const totalRewardAmount = getBigNumber("2500000");
    const startTime = duration.years(1).add(await getLatestBlockTimestamp());
    const flamePerSecond = totalRewardAmount.div(duration.days(90));

    const lpToken = <CustomToken>await deployContract("CustomToken", "Flame-USDC QS LP token", "FLAME-USDC", totalSupply);
    const flameToken = <CustomToken>await deployContract("CustomToken", "Flame token", "FLAME", totalSupply);
    const staking = <Staking>await deployProxy("Staking", flameToken.address, lpToken.address, startTime);

    await staking.setFlamePerSecond(flamePerSecond);
    await flameToken.transfer(staking.address, totalRewardAmount);
    await flameToken.approve(staking.address, ethers.constants.MaxUint256);

    console.log(lpToken.address);
    console.log(flameToken.address);
    console.log(staking.address);

    await verifyContract(lpToken.address, "Flame-USDC QS LP token", "FLAME-USDC", totalSupply);
    await verifyContract(flameToken.address, "Flame token", "FLAME", totalSupply);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
