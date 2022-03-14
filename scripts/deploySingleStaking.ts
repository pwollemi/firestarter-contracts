import { ethers } from "hardhat";
import { SingleStaking, Collection } from "../typechain";
import { verifyContract, deployContract } from "../helper/deployer";

// Mumbai Staging Deployment
async function main() {
  const flameToken = "0x51aA4F3Ed9f11399Dd8B78b816a494bcA8704E11";
  const treasury = "0xdAA1Ba6efCE73C16FddAB0423bC3F948cd381d1F";
  const collection = "0x86A703193a3769f8Fb8180688bc35C3A282B7699";

  const staking = <SingleStaking>await deployContract("SingleStaking");

  await staking.initialize(flameToken, collection, treasury);

  const day = 3600 * 24;

  await staking.addTierInfo({
    apy: 0,
    power: 100,
    penalty: 50,
    lockPeriod: 30 * day,
    fullPenaltyCliff: 0,
    penaltyMode: 0,
    isActive: true,
  });
  await staking.addTierInfo({
    apy: 9,
    power: 110,
    penalty: 40,
    lockPeriod: 180 * day,
    fullPenaltyCliff: 0,
    penaltyMode: 0,
    isActive: true,
  });
  await staking.addTierInfo({
    apy: 15,
    power: 120,
    penalty: 35,
    lockPeriod: 365 * day,
    fullPenaltyCliff: 30 * day,
    penaltyMode: 1,
    isActive: true,
  });
  await staking.addTierInfo({
    apy: 25,
    power: 200,
    penalty: 30,
    lockPeriod: 3 * 365 * day,
    fullPenaltyCliff: 90 * day,
    penaltyMode: 1,
    isActive: true,
  });

  console.log(staking.address);

  await verifyContract(staking.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
