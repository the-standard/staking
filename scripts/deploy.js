const { ethers, network } = require("hardhat");

async function main() {
  const [ user ] = await ethers.getSigners();
  const now = new Date();
  const day = 60 * 60 * 24;
  const firstStart = now - 2 * day;

  const TST = await ethers.getContractAt('LimitedERC20', '0xa42b5cF31BD2b817aa16D515DAFDe79cccE6CD0B')
  await run(`verify:verify`, {
    address: TST.address,
    constructorArguments: [
      'The Standard Token', 'TST', 18
    ],
  });

  const directory = await ethers.getContractAt('Directory', '0xda81118Ad13a2f83158333D7B7783b33e388E183')
  await run(`verify:verify`, {
    address: directory.address,
    constructorArguments: [],
  });

  for (let i = 0; i < 5; i++) {
    const start = firstStart + i * day;
    const startDate = new Date(start);
    const end = start + day;
    const maturity = end + day;

    const staking = await (await ethers.getContractFactory('Staking')).deploy(
      `Standard Staking ${startDate.toDateString()}`, `STS${startDate.toLocaleDateString()}`,
      start, end, maturity, TST.address, '0x9C777AD2575010E3ED67F6E849cfE1115BFE2A50',
      1000 * i, 1000000
    );
    await staking.deployed();
    const add = await directory.add(staking.address);
    await add.wait();

    if (i === 0) {
      await new Promise(resolve => setTimeout(resolve, 60000));

      await run(`verify:verify`, {
        address: staking.address,
        constructorArguments: [
          `Standard Staking ${startDate.toDateString()}`, `STS${startDate.toLocaleDateString()}`,
          start, end, maturity, TST.address, '0x9C777AD2575010E3ED67F6E849cfE1115BFE2A50',
          1000 * i, 1000000
        ],
      });
    }
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
