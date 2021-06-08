// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require('hardhat');
const fs = require('fs');
const deployments = require('../report.json');

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log('Deploying contracts with the account:', deployer.address);

  const RT = await hre.ethers.getContractFactory('RT');
  const rt = await RT.deploy();

  deployments.rt = rt.address;
  console.log('RT deployed to:', rt.address);

  const FT = await hre.ethers.getContractFactory('FT');
  const ft = await FT.deploy();

  deployments.ft = ft.address;
  console.log('FT deployed to:', ft.address);

  await fs.writeFileSync('report.json', JSON.stringify(deployments));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
