const { expect, beforeAll } = require('chai');
const { BigNumber } = ethers;

const FT_DECIMALS = 6;
// const convertFlame = (flame) => ethers.utils.parseUnits(flame, DECIMALS);

describe('Whitelist', function () {
  let whitelist;

  before(async function () {
    const whitelistFactory = await ethers.getContractFactory('Whitelist');
    whitelist = await whitelistFactory.deploy();
    await whitelist.deployed();
  });

  it('Attempt to to add one user', async function () {
    let fakeUser = {
      address: "0x4FB2bb19Df86feF113b2016E051898065f963CC5",
      isKycPassed: true,
      MAX_ALLOC: "100000000000"
    }

    let parsedArr = [];

    for(i in fakeUser) {
      parsedArr.push(fakeUser[i]);
    }

    let convertedUsers = [parsedArr];

    await whitelist.addToWhitelist(convertedUsers);
    const isExist = await whitelist.isUserInWL(fakeUser.address)
    const toalUsers = await whitelist.totalUsers();
    expect(isExist).to.equal(true);
    expect(toalUsers).to.equal(1);
  });

  it('Attempt to to add multiple users', async function () {

    let fakeUsers = [
      {
        address: "0x2353D4A57D9491CFC18c01b569e61943a97fdBDD",
        isKycPassed: true,
        MAX_ALLOC: "100000000000"
      },
      {
        address: "0xE8fed9d7b9E7eD19671ee35f169db6F007b2FFd4",
        isKycPassed: false,
        MAX_ALLOC: "100000000000"
      }
    ]

    let convertedUsers = fakeUsers.map(user => {
      let parsedArr = [];
      for(i in user) {
        parsedArr.push(user[i]);
      }
      return parsedArr;
    });

    await whitelist.addToWhitelist(convertedUsers);
    const isExist = await whitelist.isUserInWL("0xE8fed9d7b9E7eD19671ee35f169db6F007b2FFd4")
    const toalUsers = await whitelist.totalUsers();
    expect(isExist).to.equal(true);
    expect(toalUsers).to.equal(3);
  });

  it('Attempt to check if is user exist', async function () {

    let addrs = ["0x2353D4A57D9491CFC18c01b569e61943a97fdBDD", "0xE8fed9d7b9E7eD19671ee35f169db6F007b2FFd4", "0xAd4a5564623193fB82A18F56F725340c6dEFB1Da"]

    for(addr of addrs)  {
      const res = await whitelist.isUserInWL(addr);
      if(addr != "0xAd4a5564623193fB82A18F56F725340c6dEFB1Da")
        expect(res).to.equal(true);
      else
        expect(res).to.equal(false);
    }
  });

  it('Attempt to remove users with non-existing address', async function () {

    let addrs = ["0x2353D4A57D9491CFC18c01b569e61943a97fdBDD", "0xAd4a5564623193fB82A18F56F725340c6dEFB1Da"]

    await whitelist.removeFromWhitelist(addrs);
    const toalUsers = await whitelist.totalUsers();
    expect(toalUsers).to.equal(2);
  });

  it('Attempt to remove users with non-existing address', async function () {

    let addrs = ["0x2353D4A57D9491CFC18c01b569e61943a97fdBDD", "0xAd4a5564623193fB82A18F56F725340c6dEFB1Da"]

    await whitelist.removeFromWhitelist(addrs);
    const toalUsers = await whitelist.totalUsers();
    expect(toalUsers).to.equal(2);
  });
});
