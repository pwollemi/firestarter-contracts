const { expect } = require('chai');

const DECIMALS = 18;
const convertFlame = (flame) => ethers.utils.parseUnits(flame, DECIMALS);

describe('Marketing Vesting', function () {
  let startTime = 0;
  let flameToken, marketing;
  let owner, user1;

  const moveToTime = async (time) => {
    await network.provider.send('evm_setNextBlockTimestamp', [time]);
    await network.provider.send('evm_mine');
  };

  it('Deploy contracts', async function () {
    [owner, user1] = await ethers.getSigners();

    const FlameToken = await ethers.getContractFactory('FlameToken');
    flameToken = await FlameToken.deploy();
    await flameToken.deployed();

    const MarketingVesting = await ethers.getContractFactory(
      'MarketingVesting'
    );
    marketing = await MarketingVesting.deploy(flameToken.address);
    await marketing.deployed();

    await flameToken.transfer(marketing.address, convertFlame('50000.0'));

    await marketing.addRecipient(user1.address, convertFlame('1000.0'));

    const blockNumber = await network.provider.send('eth_blockNumber');
    const block = await network.provider.send('eth_getBlockByNumber', [
      blockNumber,
      false,
    ]);
    startTime = parseInt(block.timestamp, 16) + 1000; // add for some delay
  });

  it('Vested amount is 0 before start time', async function () {
    expect(await marketing.vested(user1.address)).to.equal(0);
  });

  it('After vesting starts', async function () {
    await moveToTime(startTime);
    expect(await marketing.vested(user1.address)).to.equal(convertFlame('0.0'));
  });

  it('After 1 month', async function () {
    startTime += 30 * 24 * 3600; // add 30 days
    await moveToTime(startTime);
    console.log(
      'first month vested: ',
      (await marketing.vested(user1.address)).toString()
    );
    // expect(await marketing.vested(user1.address)).to.equal(
    //   convertFlame((1000 / 24).toString())
    // );
  });
});
