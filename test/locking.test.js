const { expect } = require('chai');

const DECIMALS = 18;
const convertFlame = (flame) => ethers.utils.parseUnits(flame, DECIMALS);

describe('Locking', function () {
  let startTime = 0;
  let flameToken, locking;
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
    await flameToken.transfer(user1.address, convertFlame('50000.0'));

    const FlameLocking = await ethers.getContractFactory('FlameLocking');
    locking = await FlameLocking.deploy(flameToken.address);
    await locking.deployed();

    // approve
    await flameToken
      .connect(user1)
      .approve(locking.address, ethers.constants.MaxUint256);
  });

  it('Lock', async function () {
    await locking.connect(user1).lock(convertFlame('50000.0'));

    const blockNumber = await network.provider.send('eth_blockNumber');
    const block = await network.provider.send('eth_getBlockByNumber', [
      blockNumber,
      false,
    ]);
    startTime = parseInt(block.timestamp, 16);
  });

  it('If unlocks, 90% return', async function () {
    expect((await locking.getPenalty(user1.address))[1]).to.equal(convertFlame('5000.0'));
    await locking.connect(user1).unlock(convertFlame('1000.0'));
    expect(await flameToken.balanceOf(user1.address)).to.equal(convertFlame('900.0'))
  });

  // it('After 15 days, 95% return', async function () {
  //   startTime += 15 * 24 * 3600;
  //   await moveToTime(startTime);
  //   await locking.connect(user1).unlock();
  //   expect(await flameToken.balanceOf(user1.address)).to.equal(
  //     convertFlame('47500.0')
  //   );
  // });

  // it('After 30 days, 100% return', async function () {
  //   startTime += 30 * 24 * 3600;
  //   await moveToTime(startTime);
  //   await locking.connect(user1).unlock();
  //   expect(await flameToken.balanceOf(user1.address)).to.equal(
  //     convertFlame('50000.0')
  //   );
  // });
});
