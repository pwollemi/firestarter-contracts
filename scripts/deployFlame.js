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

  const initialOwners = ["0x152f2EF34a362E25E50509401CD0603a8187c2B2", "0x72a6201d1d6a64Dd722a9891B067E0be85Cd0D0d"];

  // Flame Contract
  const Flame = await hre.ethers.getContractFactory('FlameToken');
  const flame = await Flame.deploy();
  console.log('Flame deployed to:', flame.address);

  deployments.flame = flame.address;

  // Whitelist Contract
  const Whitelist = await hre.ethers.getContractFactory('Whitelist');
  const whitelist = await Whitelist.deploy(initialOwners);
  console.log('Whitelist deployed to:', whitelist.address);

  deployments.whitelist = whitelist.address;

  // Vesting Contract
  const Vesting = await hre.ethers.getContractFactory('Vesting');
  const _vestingParams = [
    100000, // initial unlock 10%
    30 * 86400, // withdraw interval 30days
    100000, // release 10%
    0 // lock period 0
  ]
  const vesting = await Vesting.deploy(flame.address, _vestingParams);
  console.log('Vesting deployed to:', vesting.address);

  deployments.vesting = vesting.address;

  // Presale Contract
  const Presale = await hre.ethers.getContractFactory('Presale');
  const _addrs = [
    deployments.ft, // FT
    flame.address, // RT
    "0x152f2EF34a362E25E50509401CD0603a8187c2B2", // PO
    whitelist.address,  //CW
    vesting.address //CV
  ]
  const _presaleParams = [
    45000, //ER : 1Flame = 0.045USD
    Math.floor(Date.now() / 1000), // PT
    86400 * 10, //PP : 10 days,
    50000, // SF : 5%,
    10000000, // GF : just placholder we can ignore for now,
    "10000000000000000000000" // IDR: 10k tokens will be deposited to vesting
  ]
  const presale = await Presale.deploy(_addrs, _presaleParams, initialOwners);
  console.log('Presale deployed to:', presale.address);

  deployments.presale = presale.address;

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
