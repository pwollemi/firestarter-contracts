import { ethers } from "hardhat";
import {
  FirestarterSft,
  FirestarterSftVesting,
  CustomToken,
} from "../typechain";

async function main() {
  const [deployer] = await ethers.getSigners();
  const totalSupply = ethers.utils.parseUnits("100000000", 18);
  const totalAmount = ethers.utils.parseUnits("20000000", 18);

  const vestingParams = {
    vestingName: "Marketing",
    amountToBeVested: totalAmount,
    initialUnlock: 1000000000, // 10%
    releaseInterval: 60, // 1 min
    releaseRate: 23150, // release 10% every month
    lockPeriod: 60, // 1min
    vestingPeriod: 86400 * 30 * 8, // 8 month
  };

  const CustomToken = await ethers.getContractFactory("CustomToken");
  const customToken = <CustomToken>(
    await CustomToken.deploy("Test", "TTT", totalSupply)
  );

  const FirestarterSftVesting = await ethers.getContractFactory(
    "FirestarterSFTVesting"
  );
  const firestarterSftVesting = <FirestarterSftVesting>(
    await FirestarterSftVesting.deploy()
  );

  const FirestarterSft = await ethers.getContractFactory("FirestarterSFT");
  const firestarterSft = <FirestarterSft>await FirestarterSft.deploy();

  await firestarterSft.initialize(
    "FirestarterSft",
    "FSFT",
    deployer.address,
    firestarterSftVesting.address,
    ethers.utils.parseEther("100"),
    ethers.utils.parseEther("100")
  );

  await firestarterSftVesting.initialize(
    customToken.address,
    firestarterSft.address,
    vestingParams
  );

  await customToken.transfer(firestarterSftVesting.address, totalAmount);

  console.log("customToken", customToken.address);
  console.log("firestarterSftVesting", firestarterSftVesting.address);
  console.log("firestarterSft", firestarterSft.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
