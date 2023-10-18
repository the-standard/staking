const { ethers } = require('hardhat');
const { expect } = require('chai');

let owner, user1, user2, EUROs, TST, StakingContract, ERC20Contract;

const TST_EUR_PRICE = 1000000 // 0.01 EUROs
const INTEREST_RATE = 5000; // 5%
const DAY = 60 * 60 * 24;
const WEEK = DAY * 7;
const START = Math.floor(new Date() / 1000);
const END = START + WEEK;
const MATURITY = END + WEEK;
const ONE_THOUSAND = ethers.utils.parseEther('1000');
const TEN_THOUSAND = ethers.utils.parseEther('10000');

beforeEach(async () => {
  [owner, user1, user2] = await ethers.getSigners();
  ERC20Contract = await ethers.getContractFactory('MockERC20');
  StakingContract = await ethers.getContractFactory('Staking');
  EUROs = await ERC20Contract.deploy('EUROs', 'Standard Euro', 18);
  TST = await ERC20Contract.deploy('TST', 'TST', 18);
});

describe('Staking', async () => {
  it('opens the pool and sets all the variables', async () => {
    const Staking = await StakingContract.deploy("Staking", "STS", START, END, MATURITY, TST.address, EUROs.address, INTEREST_RATE, TST_EUR_PRICE);

    expect(await Staking.name()).to.eq("Staking");
    expect(await Staking.symbol()).to.eq("STS");

    expect(await Staking.active()).to.eq(false);
    expect(await Staking.windowStart()).to.eq(START);
    expect(await Staking.windowEnd()).to.eq(END);
    expect(await Staking.maturity()).to.eq(MATURITY);
    expect(await Staking.SI_RATE()).to.eq(INTEREST_RATE);
    expect(await Staking.owner()).to.eq(owner.address);
  });

  it('activates the pool', async () => {
    const Staking = await StakingContract.deploy("Staking", "STS", START, END, MATURITY, TST.address, EUROs.address, INTEREST_RATE, TST_EUR_PRICE);
    expect(await Staking.active()).to.eq(false);
    await Staking.activate();
    expect(await Staking.active()).to.eq(true);
  });

  it('disables the pool', async () => {
    const Staking = await StakingContract.deploy("Staking", "STS", START, END, MATURITY, TST.address, EUROs.address, INTEREST_RATE, TST_EUR_PRICE);

    let disable = Staking.connect(user1).disable();
    await expect(disable).to.be.revertedWithCustomError(StakingContract, 'OwnableUnauthorizedAccount')
      .withArgs(user1.address);

    // pool isn't active
    disable = Staking.disable();
    await expect(disable).to.be.revertedWith('err-not-active');

    // activate the pool
    await Staking.activate();

    await expect(await Staking.active()).to.eq(true);

    await Staking.disable();
    await expect(await Staking.active()).to.eq(false);
  });

  it('refuses to mint after a user already claimed a reward', async () => {
    const Staking = await StakingContract.deploy("Staking", "STS", START, END, START, TST.address, EUROs.address, INTEREST_RATE, TST_EUR_PRICE);
    await Staking.activate();
    const value = ONE_THOUSAND;

    await TST.mint(user1.address, value);
    await TST.connect(user1).approve(Staking.address, value);
    await EUROs.mint(Staking.address, value);
    await Staking.connect(user1).mint(value);
    await Staking.connect(user1).burn();
    await TST.connect(user1).approve(Staking.address, value);

    await expect(Staking.connect(user1).mint(value)).to.be.revertedWith('err-already-claimed');
  });

  describe('balance', async () => {
    it('provides the EUROs balance of contract', async () => {
      const Staking = await StakingContract.deploy("Staking", "STS", START, END, MATURITY, TST.address, EUROs.address, INTEREST_RATE, TST_EUR_PRICE);

      await Staking.activate();

      let balance = await Staking.balance(EUROs.address);
      expect(balance).to.eq(0);

      let value = ONE_THOUSAND;
      await EUROs.mint(Staking.address, value);

      balance = await Staking.balance(EUROs.address);
      expect(balance).to.eq(value);
    });
  });

  describe('remaining', async () => {
    it('tests for the euros remaining', async () => {
      const Staking = await StakingContract.deploy("Staking", "STS", START, END, START, TST.address, EUROs.address, INTEREST_RATE, TST_EUR_PRICE);

      await Staking.activate();

      let balance = await Staking.balance(EUROs.address);
      expect(balance).to.eq(0);

      let remaining = await Staking.remaining(EUROs.address);
      expect(remaining).to.eq(0);

      let value = ONE_THOUSAND;
      await EUROs.mint(Staking.address, value);

      remaining = await Staking.remaining(EUROs.address);
      expect(remaining).to.eq(value);

      await TST.mint(user1.address, value);
      await TST.connect(user1).approve(Staking.address, value);
      await Staking.connect(user1).mint(value);
      // stake of 1_000 tst
      // 5% interest = 50 tst
      // 50 * 0.01 = .5 euros
      expectedReward = ethers.utils.parseEther('0.5');

      expect(await Staking.balance(EUROs.address)).to.eq(value);
      remaining = await Staking.remaining(EUROs.address);
      let expectedRemaining = value.sub(expectedReward);
      expect(remaining).to.equal(expectedRemaining);

      await Staking.connect(user1).burn();

      expect(await Staking.balance(EUROs.address)).to.eq(expectedRemaining);
      expect(await Staking.remaining(EUROs.address)).to.eq(expectedRemaining);
    });
  });

  describe('mint and burn rate calculations', async () => {
    it('mints a token and creates a position', async () => {
      const Staking = await StakingContract.deploy("Staking", "STS", START, END, MATURITY, TST.address, EUROs.address, INTEREST_RATE, TST_EUR_PRICE);

      const standardBalance = TEN_THOUSAND;
      await expect(Staking.mint(standardBalance)).to.be.revertedWith('err-not-active');

      // activate the pool
      await Staking.activate();

      await expect(Staking.mint(standardBalance)).to.be.revertedWith('err-overlimit');

      // Send in some euros
      let contractEUROsBalance = ONE_THOUSAND;
      await EUROs.mint(Staking.address, contractEUROsBalance);

      // try without TST allowance
      let mint = Staking.connect(user1).mint(standardBalance);
      await expect(mint).to.be.revertedWithCustomError(ERC20Contract, 'ERC20InsufficientAllowance')
        .withArgs(Staking.address, 0, standardBalance);

      await TST.mint(user1.address, standardBalance);
      await TST.connect(user1).approve(Staking.address, standardBalance);

      await Staking.connect(user1).mint(standardBalance);
      balance = await TST.balanceOf(user1.address);
      expect(balance).to.eq(0);

      // check the NFT mint
      expect(await Staking.balanceOf(user1.address)).to.eq(1);
      expect(await Staking.ownerOf(1)).to.eq(user1.address);

      // the reward should be 5% of 8000 TSTs but in SEUR:
      // 5% of 8000 = 400 TST = 20 EUROs
      // reward in TST = 5% of 10_000 = 500;
      // reward in EUROs = 500 * 0.01 = 5;
      let rewardInEUROs = ethers.utils.parseEther('5');
      let EUROsRewardRemaining = contractEUROsBalance.sub(rewardInEUROs);
      expect(await Staking.remaining(EUROs.address)).to.eq(EUROsRewardRemaining);

      // test positions
      let p = await Staking.position(user1.address);
      expect(p.nonce).to.eq(1);
      expect(p.tokenId).to.eq(1);
      expect(p.open).to.eq(true);
      expect(p.stake).to.eq(standardBalance);
      expect(p.reward).to.eq(rewardInEUROs);

      // do again to check increment etc
      await TST.mint(user1.address, standardBalance);
      await TST.connect(user1).approve(Staking.address, standardBalance);

      await Staking.connect(user1).mint(standardBalance);
      expect(await Staking.balanceOf(user1.address)).to.eq(1);

      p = await Staking.position(user1.address);
      expect(p.nonce).to.eq(2);
      expect(p.tokenId).to.eq(1);
      expect(p.open).to.eq(true);
      expect(p.stake).to.eq(standardBalance.mul(2));

      // check that the reward is the double amount now
      let doubleReward = rewardInEUROs.mul(2);
      expect(p.reward).to.eq(doubleReward);

      EUROsRewardRemaining = EUROsRewardRemaining.sub(rewardInEUROs);
      expect(await Staking.remaining(EUROs.address)).to.eq(EUROsRewardRemaining);

      // with not enough TST
      mint = Staking.connect(user1).mint(10);
      await expect(mint).to.be.revertedWith('err-not-min');

      const otherStandardBal = ONE_THOUSAND;
      // mint TSTs for second user
      await TST.mint(user2.address, otherStandardBal);
      await TST.connect(user2).approve(Staking.address, otherStandardBal);

      await Staking.connect(user2).mint(otherStandardBal);
      expect(await TST.balanceOf(user2.address)).to.eq(0);

      // check the 721 mint stuff
      expect(await Staking.balanceOf(user2.address)).to.eq(1);
      expect(await Staking.ownerOf(2)).to.eq(user2.address);

      // the reward should be 5% of 1000 TSTs but in SEUR:
      // 5% of 1000 = 50 TST = .5 EUROs
      let rewardInEUROs2 = ethers.utils.parseEther('0.5');
      EUROsRewardRemaining = EUROsRewardRemaining.sub(rewardInEUROs2);
      expect(await Staking.remaining(EUROs.address)).to.eq(EUROsRewardRemaining);

      // test positions
      p = await Staking.position(user2.address);
      expect(p.nonce).to.eq(1);
      expect(p.tokenId).to.eq(2);
      expect(p.open).to.eq(true);
      expect(p.stake).to.eq(otherStandardBal);
      expect(p.reward).to.eq(rewardInEUROs2);
    });

    it('tests the start, end, and validate stakes', async () => {
      const delayedStart = START + DAY;
      const Staking = await StakingContract.deploy("Staking", "STS", delayedStart, END, MATURITY, TST.address, EUROs.address, INTEREST_RATE, TST_EUR_PRICE);

      const standardBalance = ONE_THOUSAND;

      // activate the pool
      await Staking.activate();

      await TST.mint(user1.address, standardBalance);
      await TST.connect(user1).approve(Staking.address, standardBalance);

      // actually mint
      let mint = Staking.connect(user1).mint(standardBalance);
      await expect(mint).to.be.revertedWith('err-not-started');

      // move the time ahead
      await ethers.provider.send("evm_increaseTime", [DAY]);
      await ethers.provider.send("evm_mine");

      // over the EUROs allowance of 1m
      mint = Staking.connect(user1).mint(standardBalance);
      await expect(mint).to.be.revertedWith('err-overlimit');

      // move the time ahead again
      await ethers.provider.send("evm_increaseTime", [WEEK]);
      await ethers.provider.send("evm_mine");

      mint = Staking.connect(user1).mint(standardBalance);
      await expect(mint).to.be.revertedWith('err-finished');

      // check the disabled
      await Staking.disable();
      mint = Staking.connect(user1).mint(standardBalance);
      await expect(mint).to.be.revertedWith('err-not-active');
    });

    it('tests the exchange rate', async () => {
      let Staking = await StakingContract.deploy("Staking", "STS", START, END, MATURITY, TST.address, EUROs.address, INTEREST_RATE, TST_EUR_PRICE);

      // activate the pool
      await Staking.activate();

      let standardBalance = ethers.utils.parseEther('8800');

      // 5% of 8800 TST = 440 TST = 4.4 EUROs
      expect(await Staking.calculateReward(standardBalance)).to.eq(ethers.utils.parseEther('4.4'));

      // new amounts
      const NEW_INTEREST_RATE = 1500; // 1.5%
      standardBalance = ethers.utils.parseEther('2000000');

      Staking = await StakingContract.deploy("Staking", "STS", START, END, MATURITY, TST.address, EUROs.address, NEW_INTEREST_RATE, TST_EUR_PRICE);
      await Staking.activate();

      // 1.5% of 2_000_000 == 30_000 TST = 300 EUROs
      expect(await Staking.calculateReward(standardBalance)).to.eq(ethers.utils.parseEther('300'));
    });

    it('burns and withdraws EUROs', async () => {
      const Staking = await StakingContract.deploy("Staking", "STS", START, END, MATURITY, TST.address, EUROs.address, INTEREST_RATE, TST_EUR_PRICE);

      const standardBalance = ONE_THOUSAND;
      await expect(Staking.mint(standardBalance)).to.be.revertedWith('err-not-active');

      // activate the pool
      await Staking.activate();

      // add funds
      await EUROs.mint(Staking.address, TEN_THOUSAND);

      await TST.mint(user1.address, standardBalance);
      await TST.connect(user1).approve(Staking.address, standardBalance);

      await Staking.connect(user1).mint(standardBalance);

      let burn = Staking.connect(user1).burn();
      await expect(burn).to.be.revertedWith('err-maturity');

      // move the time ahead
      await ethers.provider.send("evm_increaseTime", [2 * WEEK]);
      await ethers.provider.send("evm_mine");

      // should burn now
      burn = Staking.connect(user1).burn();
      await expect(burn).to.not.be.reverted;

      // check the position
      let position = await Staking.position(user1.address);
      expect(position.open).to.eq(false);  // closed for business

      // 5% of 1_000 TST = 50 TST = .5 EUROs
      expect(await EUROs.balanceOf(user1.address)).to.eq(ethers.utils.parseEther('0.5'));

      TSTBalance = await TST.balanceOf(user1.address);
      expect(TSTBalance).to.eq(standardBalance);

      expect(await Staking.balanceOf(user1.address)).to.eq(0);

      // check we cannot re-burn and empty
      burn = Staking.connect(user1).burn();
      await expect(burn).to.be.revertedWith('err-closed');

      // can't burn with no position.
      burn = Staking.connect(user2).burn();
      await expect(burn).to.be.revertedWith('err-not-valid');
    });
  });

  describe('Adding EUROs to the pool', async () => {
    it('adds and removes EUROs to the pool', async () => {
      const Staking = await StakingContract.deploy("Staking", "STS", START, END, MATURITY, TST.address, EUROs.address, INTEREST_RATE, TST_EUR_PRICE);

      let value = TEN_THOUSAND;
      await EUROs.mint(Staking.address, value);

      let balance = await EUROs.balanceOf(Staking.address);
      expect(balance).to.eq(value);

      let withdraw = Staking.connect(user1).withdraw(EUROs.address);
      await expect(withdraw).to.be.revertedWithCustomError(StakingContract, 'OwnableUnauthorizedAccount')
        .withArgs(user1.address);

      // withdraw EUROs
      await Staking.withdraw(EUROs.address);

      // the contract should be empty
      balance = await EUROs.balanceOf(Staking.address);
      expect(balance).to.eq(0);

      // the owner shoud have the funds
      balance = await EUROs.balanceOf(owner.address);
      expect(balance).to.eq(value);

      // withdraw TST (which we have none)
      withdraw = Staking.withdraw(TST.address);
      await expect(withdraw).to.be.revertedWith('err-no-funds');
    });
  });
});