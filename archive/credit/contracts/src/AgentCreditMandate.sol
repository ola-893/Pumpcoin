// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface IMandatedCreditLine {
    function loanToken() external view returns (IERC20);
    function borrowFor(address human, uint256 amount) external;
    function repayFor(address human, uint256 amount) external;
}

/// @notice Human-backed working-capital draws, bounded by explicit onchain consent.
/// @dev Loan proceeds reach the agent key. No arbitrary calls or collateral withdrawal authority.
/// Root configuration is supplied by CreditLine; no administrator can grant a human's mandate.
contract AgentCreditMandate is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable creditLine;
    IERC20 public immutable loanToken;

    struct Mandate {
        uint256 drawCapWei;
        uint256 drawnWei;
        uint64 expiresAt;
        bool revoked;
    }

    mapping(address => Mandate) public mandates;
    mapping(address => address) public mandateOwner;
    mapping(address => uint256) public mandateVersion;
    /// @notice Next expected enrollment nonce for each agent key. Single-use: increments on every grant.
    mapping(address => uint256) public enrollmentNonce;

    error InvalidConfiguration();
    error InvalidMandate();
    error InvalidEnrollment();
    error AgentKeyAlreadyAssigned();
    error NotYourMandate();
    error NotAuthorized();
    error DrawCapExceeded();
    error ZeroAmount();
    error UnsupportedTokenTransfer();

    event MandateGranted(address indexed human, address indexed agentKey, uint256 drawCapWei, uint64 expiresAt);
    event MandateRevoked(address indexed human, address indexed agentKey);
    event AgentBorrowed(address indexed agentKey, uint256 amount);
    event AgentRepaid(address indexed agentKey, uint256 amount);

    constructor(address creditLine_, IERC20 loanToken_) {
        if (
            creditLine_.code.length == 0 || address(loanToken_).code.length == 0
                || IMandatedCreditLine(creditLine_).loanToken() != loanToken_
        ) revert InvalidConfiguration();
        creditLine = creditLine_;
        loanToken = loanToken_;
        // Only the immutable CreditLine can pull these tokens, through repayFor.
        loanToken_.forceApprove(creditLine_, type(uint256).max);
    }

    function enrollmentMessage(address human, address agentKey, uint256 nonce, uint64 enrollmentExpiry)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(block.chainid, address(this), human, agentKey, nonce, enrollmentExpiry));
    }

    /// @notice Two-party enrollment: the agent offchain authorizes this human/contract/chain/nonce/expiry.
    /// @dev The human submits the agent's EIP-191 signature. Single-use nonce prevents replay;
    /// mandate expiry cannot exceed the agent-authorized enrollment expiry. Renewal needs a fresh
    /// signature with the next nonce. Cumulative draw caps are preserved: a renewal resets only
    /// the new mandate's gross counter and never replenishes a prior cap.
    function grantMandate(
        address agentKey,
        uint256 drawCapWei,
        uint64 expiresAt,
        uint256 nonce,
        uint64 enrollmentExpiry,
        bytes calldata agentSignature
    ) external nonReentrant {
        if (agentKey == address(0) || agentKey == msg.sender || drawCapWei == 0 || expiresAt <= block.timestamp) {
            revert InvalidMandate();
        }
        if (nonce != enrollmentNonce[agentKey] || enrollmentExpiry < expiresAt) revert InvalidEnrollment();
        bytes32 inner = keccak256(abi.encode(block.chainid, address(this), msg.sender, agentKey, nonce, enrollmentExpiry));
        (address recovered, ECDSA.RecoverError recoverError,) =
            ECDSA.tryRecover(MessageHashUtils.toEthSignedMessageHash(inner), agentSignature);
        if (recoverError != ECDSA.RecoverError.NoError || recovered != agentKey) revert InvalidEnrollment();
        address existing = mandateOwner[agentKey];
        if (existing != address(0) && existing != msg.sender) revert AgentKeyAlreadyAssigned();
        // Explicit human renewal starts a new cumulative cap; repayment NEVER replenishes it.
        mandateOwner[agentKey] = msg.sender;
        mandates[agentKey] = Mandate(drawCapWei, 0, expiresAt, false);
        mandateVersion[agentKey] += 1;
        enrollmentNonce[agentKey] = nonce + 1;
        emit MandateGranted(msg.sender, agentKey, drawCapWei, expiresAt);
    }

    function revokeMandate(address agentKey) external nonReentrant {
        if (mandateOwner[agentKey] != msg.sender) revert NotYourMandate();
        mandates[agentKey].revoked = true;
        emit MandateRevoked(msg.sender, agentKey);
    }

    function agentBorrow(uint256 amount) external nonReentrant {
        Mandate storage m = mandates[msg.sender];
        address human = mandateOwner[msg.sender];
        if (human == address(0) || m.revoked || m.expiresAt <= block.timestamp) revert NotAuthorized();
        if (amount == 0) revert ZeroAmount();
        if (amount > m.drawCapWei - m.drawnWei) revert DrawCapExceeded();
        m.drawnWei += amount;
        uint256 beforeBalance = loanToken.balanceOf(address(this));
        IMandatedCreditLine(creditLine).borrowFor(human, amount);
        if (loanToken.balanceOf(address(this)) != beforeBalance + amount) revert UnsupportedTokenTransfer();
        uint256 beforeAgent = loanToken.balanceOf(msg.sender);
        loanToken.safeTransfer(msg.sender, amount);
        if (loanToken.balanceOf(msg.sender) != beforeAgent + amount) revert UnsupportedTokenTransfer();
        emit AgentBorrowed(msg.sender, amount);
    }

    /// @notice Repayment from the agent's own tokens remains possible after expiry or revocation.
    /// @dev It grants no draw/spending authority and never resets the gross draw counter.
    function agentRepay(uint256 amount) external nonReentrant {
        address human = mandateOwner[msg.sender];
        if (human == address(0)) revert NotAuthorized();
        if (amount == 0) revert ZeroAmount();
        uint256 beforeBalance = loanToken.balanceOf(address(this));
        loanToken.safeTransferFrom(msg.sender, address(this), amount);
        if (loanToken.balanceOf(address(this)) != beforeBalance + amount) revert UnsupportedTokenTransfer();
        IMandatedCreditLine(creditLine).repayFor(human, amount);
        if (loanToken.balanceOf(address(this)) != beforeBalance) revert UnsupportedTokenTransfer();
        emit AgentRepaid(msg.sender, amount);
    }
}
