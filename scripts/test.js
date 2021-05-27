// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log('Deploying contracts with the account:', deployer.address);

  console.log('Account balance:', (await deployer.getBalance()).toString());

  // const FlameToken = await hre.ethers.getContractFactory('FlameToken');
  // const flameToken = await FlameToken.deploy();
  // console.log('FlameToken deployed to:', flameToken.address);

  const PresaleVesting = await hre.ethers.getContractFactory('PresaleVesting');
  //   const presaleVesting = await PresaleVesting.deploy(flameToken.address);
  const presaleVesting = await PresaleVesting.deploy(
    '0x79068a4D63997cC4b553B3aa230026885135E128'
  );

  console.log('PresaleVesting deployed to:', presaleVesting.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
