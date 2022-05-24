import { ethers } from "hardhat";
import { SingleStaking, Collection } from "../typechain";
import { verifyContract, deployContract, deployProxy } from "../helper/deployer";

// Mumbai Staging Deployment
async function main() {
  const flameToken = "0x22e3f02f86Bc8eA0D73718A2AE8851854e62adc5";
  const treasury = "0x000000000000000000000000000000000000dEaD";
  const collection = "0x50B88955C82A6768a78Ad30b02af345F61ff3986";

  const staking = <SingleStaking>await deployProxy("SingleStaking", flameToken, collection, treasury);
  
  const day = 3600 * 24;

  await staking.addTierInfo({
    apy: 0,
    power: 100,
    penalty: 100,
    lockPeriod: 30 * day,
    fullPenaltyCliff: 0,
    penaltyMode: 0,
    isActive: true,
  });
  console.log("tier 1 added");
  await staking.addTierInfo({
    apy: 6,
    power: 140,
    penalty: 40,
    lockPeriod: 180 * day,
    fullPenaltyCliff: 0,
    penaltyMode: 0,
    isActive: true,
  });
  console.log("tier 2 added");
  await staking.addTierInfo({
    apy: 13,
    power: 180,
    penalty: 35,
    lockPeriod: 365 * day,
    fullPenaltyCliff: 30 * day,
    penaltyMode: 1,
    isActive: true,
  });
  console.log("tier 3 added");
  await staking.addTierInfo({
    apy: 23,
    power: 250,
    penalty: 30,
    lockPeriod: 3 * 365 * day,
    fullPenaltyCliff: 90 * day,
    penaltyMode: 1,
    isActive: true,
  });
  console.log("tier 4 added");

  console.log(staking.address);

  await staking.transferOwnership("0xFa14B2103f0b590fD5d76624A5972061828Ba2e2");

  await verifyContract(staking.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
