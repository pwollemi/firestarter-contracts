// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from 'hardhat';
import { writeFileSync } from 'fs';
import deployments, { flame as _flame, whitelist as _whitelist, vesting as _vesting, ft, presale as _presale, locking as _locking } from '../report.json';

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log('Deploying contracts with the account:', deployer.address);

  const initialOwners = ["0x152f2EF34a362E25E50509401CD0603a8187c2B2", "0x72a6201d1d6a64Dd722a9891B067E0be85Cd0D0d"];

  // Flame Contract
  const Flame = await _ethers.getContractFactory('FlameToken');
  const flame = await Flame.deploy();
  console.log('Flame deployed to:', flame.address);

  _flame = flame.address;

  // Whitelist Contract
  const Whitelist = await _ethers.getContractFactory('Whitelist');
  const whitelist = await Whitelist.deploy(initialOwners);
  console.log('Whitelist deployed to:', whitelist.address);

  _whitelist = whitelist.address;

  // Vesting Contract
  const Vesting = await _ethers.getContractFactory('Vesting');
  const _vestingParams = [
    100000, // initial unlock 10%
    30 * 86400, // withdraw interval 30days
    100000, // release 10%
    0 // lock period 0
  ]
  const vesting = await Vesting.deploy(flame.address, _vestingParams);
  console.log('Vesting deployed to:', vesting.address);

  _vesting = vesting.address;

  // Presale Contract
  const Presale = await _ethers.getContractFactory('Presale');
  const _addrs = [
    ft, // FT
    flame.address, // RT
    "0x152f2EF34a362E25E50509401CD0603a8187c2B2", // PO
    whitelist.address,  //CW
    vesting.address //CV
  ]
  const _presaleParams = [
    "45000", //ER : 1Flame = 0.045USD
    (Math.floor(Date.now() / 1000)).toString(), // PT
    "864000", //PP : 10 days,
    "50000", // SF : 5%,
    "10000000", // GF : just placholder we can ignore for now,
    "10000000000000000000000" // IDR: 10k tokens will be deposited to vesting
  ]
  console.log('Presale params: ', _addrs, _presaleParams, initialOwners);
  const presale = await Presale.deploy(_addrs, _presaleParams, initialOwners);
  console.log('Presale deployed to:', presale.address);

  await vesting.init(presale.address);
  _presale = presale.address;

  // FlameLocking
  const Locking = await _ethers.getContractFactory('FlameLocking');
  const locking = await Locking.deploy(flame.address);
  console.log('Locking deployed to:', locking.address);

  _locking = locking.address
  await writeFileSync('report.json', JSON.stringify(deployments));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
