const { expect } = require('chai');

const DECIMALS = 18;
const convertFlame = (flame) => ethers.utils.parseUnits(flame, DECIMALS);

describe('Team Vesting', function () {
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

    const TeamVesting = await ethers.getContractFactory('TeamVesting');
    vesting = await TeamVesting.deploy(flameToken.address);
    await vesting.deployed();

    await flameToken.transfer(vesting.address, convertFlame('200000.0'));

    await vesting.addRecipient(user1.address, convertFlame('1200.0'));

    const blockNumber = await network.provider.send('eth_blockNumber');
    const block = await network.provider.send('eth_getBlockByNumber', [
      blockNumber,
      false,
    ]);
    startTime = parseInt(block.timestamp, 16) + 1000; // add for some delay

    await vesting.setStartTime(startTime);
  });

  it('Vested amount is 0 before start time', async function () {
    expect(await vesting.locked(user1.address)).to.equal(
      convertFlame('1200.0')
    );
    expect(await vesting.vested(user1.address)).to.equal(0);
  });

  it('After vesting starts, vested amount is 0 for 6 months', async function () {
    await moveToTime(startTime);
    expect(await vesting.vested(user1.address)).to.equal(convertFlame('0.0'));

    startTime += 30 * 24 * 3600; // add 30 days
    await moveToTime(startTime);
    expect(await vesting.vested(user1.address)).to.equal(0);

    startTime += 150 * 24 * 3600; // add remaining 150 days
    await moveToTime(startTime);
    expect(await vesting.vested(user1.address)).to.equal(0);
  });

  it('After 1 month', async function () {
    startTime += 30 * 24 * 3600; // add 30 days
    await moveToTime(startTime);
    expect(await vesting.vested(user1.address)).to.be.closeTo(
      convertFlame(String((1200 / 365) * 30)),
      10 ** 10
    );
  });

  it('After 2 months', async function () {
    startTime += 30 * 24 * 3600; // add 30 days
    await moveToTime(startTime);
    expect(await vesting.vested(user1.address)).to.be.closeTo(
      convertFlame(String((1200 / 365) * 60)),
      10 ** 10
    );
  });

  it('After 3 months', async function () {
    startTime += 30 * 24 * 3600; // add 30 days
    await moveToTime(startTime);
    expect(await vesting.vested(user1.address)).to.be.closeTo(
      convertFlame(String((1200 / 365) * 90)),
      10 ** 10
    );
  });

  it('After 4 months', async function () {
    startTime += 30 * 24 * 3600; // add 30 days
    await moveToTime(startTime);
    expect(await vesting.vested(user1.address)).to.be.closeTo(
      convertFlame(String((1200 / 365) * 120)),
      10 ** 10
    );
  });

  it('After 5 months', async function () {
    startTime += 30 * 24 * 3600; // add 30 days
    await moveToTime(startTime);
    expect(await vesting.vested(user1.address)).to.be.closeTo(
      convertFlame(String((1200 / 365) * 150)),
      10 ** 10
    );
  });
});
