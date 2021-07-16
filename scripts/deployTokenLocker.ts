import { deployContract, verifyContract } from "../helper/deployer";

async function main() {
    const flameAddress = "0x2144c0d70aEF70D0B176Ab09D113b8eAb12372d3";
    const tokenLock = await deployContract("TokenLock", flameAddress);
    await verifyContract(tokenLock.address, flameAddress);
    console.log(tokenLock.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
