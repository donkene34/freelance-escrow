// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FreelanceEscrow} from "../FreelanceEscrow.sol";

/**
 * @dev CONTRAT DE TEST UNIQUEMENT - ne jamais déployer en production.
 *
 * Ce contrat déploie lui-même l'escrow (il en est donc le client) puis tente
 * de rappeler refund() depuis son receive() pendant que l'escrow lui envoie
 * ses fonds : c'est le scénario de reentrancy classique.
 */
contract ReentrancyAttacker {
    FreelanceEscrow public immutable escrow;

    /// true si receive() a été appelé (donc si l'escrow a bien envoyé des fonds)
    bool public reentryAttempted;
    /// true si l'appel réentrant a réussi (ne doit jamais arriver)
    bool public reentrySucceeded;
    /// true : on avale l'échec de l'appel réentrant ; false : on le laisse remonter
    bool public swallowFailure;

    constructor(address freelancer, address arbiter, uint256 deadline) {
        escrow = new FreelanceEscrow(freelancer, arbiter, deadline);
    }

    function setSwallowFailure(bool value) external {
        swallowFailure = value;
    }

    function fundEscrow() external payable {
        escrow.fund{value: msg.value}();
    }

    function attackRefund() external {
        escrow.refund();
    }

    receive() external payable {
        reentryAttempted = true;
        if (swallowFailure) {
            try escrow.refund() {
                reentrySucceeded = true;
            } catch {}
        } else {
            escrow.refund();
            reentrySucceeded = true;
        }
    }
}
