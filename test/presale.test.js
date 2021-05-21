const { expect } = require('chai');

const DECIMALS = 18;
const convertFlame = (flame) => ethers.utils.parseUnits(flame, DECIMALS);

describe('Presale Vesting', function () {
  let startTime = 0;
  let flameToken, vesting;
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

    const PresaleVesting = await ethers.getContractFactory('PresaleVesting');
    vesting = await PresaleVesting.deploy(flameToken.address);
    await vesting.deployed();

    await flameToken.transfer(vesting.address, convertFlame('200000.0'));

    await vesting.addRecipient(user1.address, convertFlame('1000.0'));

    const blockNumber = await network.provider.send('eth_blockNumber');
    const block = await network.provider.send('eth_getBlockByNumber', [
      blockNumber,
      false,
    ]);
    startTime = parseInt(block.timestamp, 16) + 1000; // add for some delay

    await vesting.setStartTime(startTime);
  });

  const deviation = 10 ** 10;

  it('Vested amount is 0 before start time', async function () {
    expect(await vesting.locked(user1.address)).to.equal(
      convertFlame('1000.0'),
      deviation
    );
    expect(await vesting.vested(user1.address)).to.equal(0);
  });

  it('After vesting starts, can vest 15% of total amount', async function () {
    await moveToTime(startTime);
    expect(await vesting.vested(user1.address)).to.equal(
      convertFlame('150.0'),
      deviation
    );
  });

  it('After 1 month', async function () {
    startTime += 30 * 24 * 3600; // add 30 days
    await moveToTime(startTime);
    expect(await vesting.vested(user1.address)).to.be.closeTo(
      convertFlame('300.0'),
      deviation
    );
  });

  it('After 2 months', async function () {
    startTime += 30 * 24 * 3600; // add 30 days
    await moveToTime(startTime);
    expect(await vesting.vested(user1.address)).to.be.closeTo(
      convertFlame('450.0'),
      deviation
    );
  });

  it('After 3 months', async function () {
    startTime += 30 * 24 * 3600; // add 30 days
    await moveToTime(startTime);
    expect(await vesting.vested(user1.address)).to.be.closeTo(
      convertFlame('600.0'),
      deviation
    );
  });

  it('After 4 months', async function () {
    startTime += 30 * 24 * 3600; // add 30 days
    await moveToTime(startTime);
    expect(await vesting.vested(user1.address)).to.be.closeTo(
      convertFlame('750.0'),
      deviation
    );
  });

  it('After 5 months', async function () {
    startTime += 30 * 24 * 3600; // add 30 days
    await moveToTime(startTime);
    expect(await vesting.vested(user1.address)).to.be.closeTo(
      convertFlame('900.0'),
      deviation
    );
  });

  it('After 6 months', async function () {
    startTime += 30 * 24 * 3600; // add 30 days
    await moveToTime(startTime);
    expect(await vesting.vested(user1.address)).to.be.closeTo(
      convertFlame('1000.0'),
      deviation
    );
  });

  it('After 7 months', async function () {
    startTime += 30 * 24 * 3600; // add 30 days
    await moveToTime(startTime);
    expect(await vesting.vested(user1.address)).to.equal(
      convertFlame('1000.0')
    );
  });

  it('withdraw', async function () {
    await vesting.connect(user1).withdraw();
    expect(await flameToken.balanceOf(user1.address)).to.equal(
      convertFlame('1000.0')
    );
    expect(await vesting.withdrawable(user1.address)).to.equal(0);
  });
});
