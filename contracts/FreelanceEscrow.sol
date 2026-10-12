// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FreelanceEscrow
 * @notice Escrow entre un client et un freelancer, avec un arbitre en cas de litige.
 * Le déployeur du contrat est le client.
 */
contract FreelanceEscrow is ReentrancyGuard {
    enum State {
        Created,
        Funded,
        Delivered,
        Disputed,
        Released,
        Refunded
    }

    address public immutable client;
    address public immutable freelancer;
    address public immutable arbiter;
    uint256 public immutable deadline;

    State public state;
    uint256 public amount;

    event Funded(address indexed client, uint256 amount);
    event Delivered(address indexed freelancer);
    event Released(address indexed client, address indexed freelancer, uint256 amount);
    event Disputed(address indexed raisedBy, uint256 amount);
    event Resolved(address indexed arbiter, address indexed recipient, bool payFreelancer, uint256 amount);
    event Refunded(address indexed client, uint256 amount);

    constructor(address _freelancer, address _arbiter, uint256 _deadline) {
        require(_freelancer != address(0), "Freelancer is zero address");
        require(_arbiter != address(0), "Arbiter is zero address");
        require(_freelancer != msg.sender, "Client cannot be freelancer");
        require(_arbiter != msg.sender, "Client cannot be arbiter");
        require(_arbiter != _freelancer, "Arbiter cannot be freelancer");
        require(_deadline > block.timestamp, "Deadline must be in the future");

        client = msg.sender;
        freelancer = _freelancer;
        arbiter = _arbiter;
        deadline = _deadline;
        state = State.Created;
    }

    /// @notice Le client dépose les fonds. Created -> Funded.
    function fund() external payable {
        require(msg.sender == client, "Only client");
        require(state == State.Created, "Invalid state: not Created");
        require(msg.value > 0, "Amount must be > 0");

        state = State.Funded;
        amount = msg.value;

        emit Funded(msg.sender, msg.value);
    }

    /// @notice Le freelancer signale la livraison. Funded -> Delivered.
    function markDelivered() external {
        require(msg.sender == freelancer, "Only freelancer");
        require(state == State.Funded, "Invalid state: not Funded");

        state = State.Delivered;

        emit Delivered(msg.sender);
    }

    /// @notice Le client valide le travail et libère les fonds au freelancer.
    /// @dev Possible depuis Funded ou Delivered : le client peut toujours payer,
    ///      même si le freelancer a oublié de marquer la livraison.
    function release() external nonReentrant {
        require(msg.sender == client, "Only client");
        require(state == State.Funded || state == State.Delivered, "Invalid state: nothing to release");

        uint256 payout = amount;

        // Effects avant interactions
        state = State.Released;
        amount = 0;

        emit Released(msg.sender, freelancer, payout);

        // Interaction
        _sendValue(freelancer, payout);
    }

    /// @notice Le client ou le freelancer ouvre un litige. Funded/Delivered -> Disputed.
    function raiseDispute() external {
        require(msg.sender == client || msg.sender == freelancer, "Only client or freelancer");
        require(state == State.Funded || state == State.Delivered, "Invalid state: cannot dispute");

        state = State.Disputed;

        emit Disputed(msg.sender, amount);
    }

    /// @notice L'arbitre tranche : paie le freelancer (Released) ou rembourse le client (Refunded).
    function resolveDispute(bool payFreelancer) external nonReentrant {
        require(msg.sender == arbiter, "Only arbiter");
        require(state == State.Disputed, "Invalid state: not Disputed");

        uint256 payout = amount;
        address recipient = payFreelancer ? freelancer : client;

        // Effects avant interactions
        state = payFreelancer ? State.Released : State.Refunded;
        amount = 0;

        emit Resolved(msg.sender, recipient, payFreelancer, payout);

        // Interaction
        _sendValue(recipient, payout);
    }

    /// @notice Le client récupère ses fonds :
    ///         - avant financement (annulation, state Created), ou
    ///         - après la deadline si le travail n'a jamais été livré (state Funded).
    function refund() external nonReentrant {
        require(msg.sender == client, "Only client");

        uint256 payout;

        if (state == State.Created) {
            // Annulation avant financement : rien à transférer
            payout = 0;
        } else {
            require(state == State.Funded, "Invalid state: cannot refund");
            require(block.timestamp > deadline, "Deadline not reached");
            payout = amount;
        }

        // Effects avant interactions
        state = State.Refunded;
        amount = 0;

        emit Refunded(msg.sender, payout);

        // Interaction
        if (payout > 0) {
            _sendValue(client, payout);
        }
    }

    function _sendValue(address to, uint256 value) private {
        (bool success, ) = to.call{value: value}("");
        require(success, "Transfer failed");
    }
}
