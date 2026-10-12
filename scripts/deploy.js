const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  const [deployer, localFreelancer, localArbiter] = await ethers.getSigners();

  const isLocal = network.name === "hardhat" || network.name === "localhost";

  // Sur Sepolia, les adresses viennent du .env ; en local on utilise les comptes de test
  const freelancer = process.env.FREELANCER_ADDRESS || (isLocal ? localFreelancer.address : undefined);
  const arbiter = process.env.ARBITER_ADDRESS || (isLocal ? localArbiter.address : undefined);

  if (!freelancer || !arbiter) {
    throw new Error("FREELANCER_ADDRESS et ARBITER_ADDRESS doivent être définis dans .env");
  }

  const deadlineDays = Number(process.env.DEADLINE_DAYS || 14);
  const latestBlock = await ethers.provider.getBlock("latest");
  const deadline = latestBlock.timestamp + deadlineDays * 24 * 60 * 60;

  console.log(`Réseau      : ${network.name}`);
  console.log(`Déployeur   : ${deployer.address}`);

  const Escrow = await ethers.getContractFactory("FreelanceEscrow");
  const escrow = await Escrow.deploy(freelancer, arbiter, deadline);
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();

  console.log("\nFreelanceEscrow déployé !");
  console.log(`Contrat     : ${address}`);
  console.log(`Client      : ${await escrow.client()}`);
  console.log(`Freelancer  : ${await escrow.freelancer()}`);
  console.log(`Arbitre     : ${await escrow.arbiter()}`);
  console.log(`Deadline    : ${new Date(deadline * 1000).toISOString()} (timestamp ${deadline})`);

  if (network.name === "sepolia") {
    console.log(`\nEtherscan   : https://sepolia.etherscan.io/address/${address}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
