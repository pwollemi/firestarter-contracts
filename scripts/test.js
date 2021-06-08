// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require('hardhat');
const Presale = require('../artifacts/contracts/formal/Presale.sol/Presale.json');
async function main() {
  const [deployer] = await ethers.getSigners();

  console.log('Deploying contracts with the account:', deployer.address);

  // const FlameToken = await hre.ethers.getContractFactory('FlameToken');
  // const flameToken = await FlameToken.deploy();
  // console.log('FlameToken deployed to:', flameToken.address);

  const presale = await hre.ethers.getContractAt(Presale.abi, "0xfaeecD3D755D1E680eF5741E5e70c48345784C01");
  const PT = await presale.PT();

  console.log('PT:', PT.toString());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
