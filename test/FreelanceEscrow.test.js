const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const State = {
  Created: 0n,
  Funded: 1n,
  Delivered: 2n,
  Disputed: 3n,
  Released: 4n,
  Refunded: 5n,
};

const AMOUNT = ethers.parseEther("1");
const SEVEN_DAYS = 7 * 24 * 60 * 60;

describe("FreelanceEscrow", function () {
  // ---------- Fixtures ----------
  async function deployFixture() {
    const [client, freelancer, arbiter, stranger] = await ethers.getSigners();
    const deadline = (await time.latest()) + SEVEN_DAYS;

    const Escrow = await ethers.getContractFactory("FreelanceEscrow", client);
    const escrow = await Escrow.deploy(freelancer.address, arbiter.address, deadline);
    await escrow.waitForDeployment();

    return { escrow, client, freelancer, arbiter, stranger, deadline };
  }

  async function fundedFixture() {
    const base = await deployFixture();
    await base.escrow.connect(base.client).fund({ value: AMOUNT });
    return base;
  }

  async function deliveredFixture() {
    const base = await fundedFixture();
    await base.escrow.connect(base.freelancer).markDelivered();
    return base;
  }

  async function disputedFixture() {
    const base = await deliveredFixture();
    await base.escrow.connect(base.client).raiseDispute();
    return base;
  }

  // ---------- 1. Déploiement ----------
  describe("Déploiement", function () {
    it("initialise correctement les rôles, la deadline et l'état", async function () {
      const { escrow, client, freelancer, arbiter, deadline } = await loadFixture(deployFixture);

      expect(await escrow.client()).to.equal(client.address);
      expect(await escrow.freelancer()).to.equal(freelancer.address);
      expect(await escrow.arbiter()).to.equal(arbiter.address);
      expect(await escrow.deadline()).to.equal(deadline);
      expect(await escrow.state()).to.equal(State.Created);
      expect(await escrow.amount()).to.equal(0n);
    });
  });

  // ---------- 2 & 3. fund() ----------
  describe("fund()", function () {
    it("réussit et passe l'état à Funded", async function () {
      const { escrow, client } = await loadFixture(deployFixture);

      await expect(escrow.connect(client).fund({ value: AMOUNT }))
        .to.emit(escrow, "Funded")
        .withArgs(client.address, AMOUNT);

      expect(await escrow.state()).to.equal(State.Funded);
      expect(await escrow.amount()).to.equal(AMOUNT);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(AMOUNT);
    });

    it("échoue si appelé par quelqu'un d'autre que le client", async function () {
      const { escrow, freelancer, arbiter, stranger } = await loadFixture(deployFixture);

      for (const signer of [freelancer, arbiter, stranger]) {
        await expect(escrow.connect(signer).fund({ value: AMOUNT })).to.be.revertedWith("Only client");
      }
    });
  });

  // ---------- 4. markDelivered() ----------
  describe("markDelivered()", function () {
    it("réussit pour le freelancer", async function () {
      const { escrow, freelancer } = await loadFixture(fundedFixture);

      await expect(escrow.connect(freelancer).markDelivered())
        .to.emit(escrow, "Delivered")
        .withArgs(freelancer.address);

      expect(await escrow.state()).to.equal(State.Delivered);
    });

    it("échoue pour les autres", async function () {
      const { escrow, client, arbiter, stranger } = await loadFixture(fundedFixture);

      for (const signer of [client, arbiter, stranger]) {
        await expect(escrow.connect(signer).markDelivered()).to.be.revertedWith("Only freelancer");
      }
    });
  });

  // ---------- 5, 6 & 11. release() ----------
  describe("release()", function () {
    it("transfère les fonds au freelancer et passe à Released", async function () {
      const { escrow, client, freelancer } = await loadFixture(deliveredFixture);

      await expect(escrow.connect(client).release()).to.changeEtherBalances(
        [escrow, freelancer],
        [-AMOUNT, AMOUNT]
      );

      expect(await escrow.state()).to.equal(State.Released);
      expect(await escrow.amount()).to.equal(0n);
    });

    it("émet l'event Released avec les adresses et le montant", async function () {
      const { escrow, client, freelancer } = await loadFixture(deliveredFixture);

      await expect(escrow.connect(client).release())
        .to.emit(escrow, "Released")
        .withArgs(client.address, freelancer.address, AMOUNT);
    });

    it("échoue si appelé par quelqu'un d'autre que le client", async function () {
      const { escrow, freelancer, arbiter, stranger } = await loadFixture(deliveredFixture);

      for (const signer of [freelancer, arbiter, stranger]) {
        await expect(escrow.connect(signer).release()).to.be.revertedWith("Only client");
      }
    });

    it("double release() impossible", async function () {
      const { escrow, client } = await loadFixture(deliveredFixture);

      await escrow.connect(client).release();
      await expect(escrow.connect(client).release()).to.be.revertedWith(
        "Invalid state: nothing to release"
      );
    });
  });

  // ---------- 7. raiseDispute() ----------
  describe("raiseDispute()", function () {
    it("fonctionne depuis Funded", async function () {
      const { escrow, client } = await loadFixture(fundedFixture);

      await expect(escrow.connect(client).raiseDispute())
        .to.emit(escrow, "Disputed")
        .withArgs(client.address, AMOUNT);

      expect(await escrow.state()).to.equal(State.Disputed);
    });

    it("fonctionne depuis Delivered (par le freelancer)", async function () {
      const { escrow, freelancer } = await loadFixture(deliveredFixture);

      await expect(escrow.connect(freelancer).raiseDispute())
        .to.emit(escrow, "Disputed")
        .withArgs(freelancer.address, AMOUNT);

      expect(await escrow.state()).to.equal(State.Disputed);
    });

    it("échoue pour l'arbitre et les tiers", async function () {
      const { escrow, arbiter, stranger } = await loadFixture(fundedFixture);

      for (const signer of [arbiter, stranger]) {
        await expect(escrow.connect(signer).raiseDispute()).to.be.revertedWith(
          "Only client or freelancer"
        );
      }
    });
  });

  // ---------- 8. resolveDispute() ----------
  describe("resolveDispute()", function () {
    it("envoie les fonds au freelancer si payFreelancer = true (state Released)", async function () {
      const { escrow, arbiter, freelancer } = await loadFixture(disputedFixture);

      await expect(escrow.connect(arbiter).resolveDispute(true)).to.changeEtherBalances(
        [escrow, freelancer],
        [-AMOUNT, AMOUNT]
      );

      expect(await escrow.state()).to.equal(State.Released);
    });

    it("rembourse le client si payFreelancer = false (state Refunded)", async function () {
      const { escrow, arbiter, client } = await loadFixture(disputedFixture);

      await expect(escrow.connect(arbiter).resolveDispute(false)).to.changeEtherBalances(
        [escrow, client],
        [-AMOUNT, AMOUNT]
      );

      expect(await escrow.state()).to.equal(State.Refunded);
    });

    it("échoue si appelé par quelqu'un d'autre que l'arbitre", async function () {
      const { escrow, client, freelancer, stranger } = await loadFixture(disputedFixture);

      for (const signer of [client, freelancer, stranger]) {
        await expect(escrow.connect(signer).resolveDispute(true)).to.be.revertedWith("Only arbiter");
      }
    });
  });

  // ---------- 9 & 10. refund() ----------
  describe("refund()", function () {
    it("fonctionne avant financement (annulation)", async function () {
      const { escrow, client } = await loadFixture(deployFixture);

      await expect(escrow.connect(client).refund())
        .to.emit(escrow, "Refunded")
        .withArgs(client.address, 0n);

      expect(await escrow.state()).to.equal(State.Refunded);
    });

    it("fonctionne après la deadline si le travail n'a jamais été livré", async function () {
      const { escrow, client, deadline } = await loadFixture(fundedFixture);

      await time.increaseTo(deadline + 1);

      await expect(escrow.connect(client).refund()).to.changeEtherBalances(
        [escrow, client],
        [-AMOUNT, AMOUNT]
      );

      expect(await escrow.state()).to.equal(State.Refunded);
      expect(await escrow.amount()).to.equal(0n);
    });

    it("échoue avant la deadline si les fonds sont déposés", async function () {
      const { escrow, client } = await loadFixture(fundedFixture);

      await expect(escrow.connect(client).refund()).to.be.revertedWith("Deadline not reached");
    });

    it("échoue si le travail a été livré, même après la deadline", async function () {
      const { escrow, client, deadline } = await loadFixture(deliveredFixture);

      await time.increaseTo(deadline + 1);

      await expect(escrow.connect(client).refund()).to.be.revertedWith("Invalid state: cannot refund");
    });

    it("échoue si appelé par quelqu'un d'autre que le client", async function () {
      const { escrow, freelancer, arbiter, stranger } = await loadFixture(deployFixture);

      for (const signer of [freelancer, arbiter, stranger]) {
        await expect(escrow.connect(signer).refund()).to.be.revertedWith("Only client");
      }
    });
  });

  // ---------- 12. Reentrancy ----------
  describe("Reentrancy", function () {
    async function attackerFixture() {
      const [, freelancer, arbiter] = await ethers.getSigners();
      const deadline = (await time.latest()) + SEVEN_DAYS;

      const Attacker = await ethers.getContractFactory("ReentrancyAttacker");
      const attacker = await Attacker.deploy(freelancer.address, arbiter.address, deadline);
      await attacker.waitForDeployment();

      const escrow = await ethers.getContractAt("FreelanceEscrow", await attacker.escrow());
      await attacker.fundEscrow({ value: AMOUNT });

      return { attacker, escrow, deadline };
    }

    it("l'attaquant est bien le client de l'escrow", async function () {
      const { attacker, escrow } = await loadFixture(attackerFixture);

      expect(await escrow.client()).to.equal(await attacker.getAddress());
      expect(await escrow.state()).to.equal(State.Funded);
    });

    it("bloque la reentrancy sur refund() : l'appel réentrant échoue et la transaction revert", async function () {
      const { attacker, escrow, deadline } = await loadFixture(attackerFixture);
      await time.increaseTo(deadline + 1);

      await expect(attacker.attackRefund()).to.be.revertedWith("Transfer failed");

      // Rien n'a bougé : les fonds sont toujours dans l'escrow
      expect(await escrow.state()).to.equal(State.Funded);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(AMOUNT);
      expect(await ethers.provider.getBalance(await attacker.getAddress())).to.equal(0n);
    });

    it("même si l'attaquant avale l'échec, il ne récupère les fonds qu'une seule fois", async function () {
      const { attacker, escrow, deadline } = await loadFixture(attackerFixture);
      await attacker.setSwallowFailure(true);
      await time.increaseTo(deadline + 1);

      await attacker.attackRefund();

      expect(await attacker.reentryAttempted()).to.equal(true);
      expect(await attacker.reentrySucceeded()).to.equal(false);
      expect(await escrow.state()).to.equal(State.Refunded);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(0n);
      expect(await ethers.provider.getBalance(await attacker.getAddress())).to.equal(AMOUNT);
    });
  });
});
