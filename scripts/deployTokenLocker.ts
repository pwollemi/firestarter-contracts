import hre, { ethers } from "hardhat";
import { TokenLockFactory } from "../typechain";

async function main() {
    const flameAddress = "0x87e31353B6Abc1496C902F496B02f184bAa0627E";

    const tokenLockerFactory = <TokenLockFactory>await ethers.getContractFactory("TokenLock");
    const tokenLock = await tokenLockerFactory.deploy(flameAddress);
    await tokenLock.deployed();
    console.log(tokenLock.address);

    await hre.run("verify:verify", {
        address: tokenLock.address,
        constructorArguments: [flameAddress]
    });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
