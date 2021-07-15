import hre, { ethers } from "hardhat";
import { TokenLockFactory } from "../typechain";

async function main() {
    const flameAddress = "0x10b51f80Caa52e55EE34194a9336D809df680983";

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
