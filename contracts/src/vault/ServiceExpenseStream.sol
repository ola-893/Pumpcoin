// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Manual operating-expense escrow for the vault slice (NOT timed streaming).
/// @dev Disclosed limitation: there is no start time, rate, scheduled accrual or
/// executor/worker here. Funding, accrual (in the vault), settlement and refunds are
/// explicit admin steps. Do not present this as FlowPay streaming.
///
/// Each authorization is a stable scoped obligation: id = keccak(chain, stream, nonce)
/// with stored service, recipient and funded amount. Settlement and refunds execute
/// ONLY against the stored obligation (no caller-supplied recipient/service), support
/// bounded partial amounts, and use separate settle/refund nonces so duplicates and
/// over-payments revert. Amount is excluded from the obligation id, so reusing a
/// nonce with a different amount collides and reverts instead of paying twice.
/// Refunds reference the obligation id; arbitrary payment ids are rejected.
contract ServiceExpenseStream {
    using SafeERC20 for IERC20;

    IERC20 public immutable quote;
    address public immutable vault;
    address public admin;
    uint256 public immutable chainId;
    uint256 public reserved;
    uint256 public settled;
    uint256 public refunded;
    mapping(address => bool) public allowedRecipient;
    mapping(bytes32 => bool) public usedSettleNonce;
    mapping(bytes32 => bool) public usedRefundNonce;

    struct Obligation {
        bytes32 serviceId;
        address recipient;
        uint256 funded;
        uint256 settled;
        uint256 refunded;
        bool exists;
    }
    mapping(bytes32 => Obligation) public obligations;

    error NotAdmin();
    error NotVault();
    error BadRecipient();
    error BadToken();
    error BadChain();
    error Replay();
    error UnknownObligation();
    error Overdraw();
    error ZeroAmount();
    error UnsupportedTokenTransfer();

    event RecipientUpdated(address indexed recipient, bool allowed);
    event Funded(bytes32 indexed obligationId, uint256 amount, bytes32 indexed serviceId, address indexed recipient);
    event Settled(bytes32 indexed obligationId, uint256 amount, bytes32 indexed serviceId, address indexed recipient);
    event Refunded(bytes32 indexed obligationId, uint256 amount);

    constructor(IERC20 quote_, address vault_, address admin_) {
        require(address(quote_) != address(0) && vault_ != address(0) && admin_ != address(0), "cfg");
        quote = quote_;
        vault = vault_;
        admin = admin_;
        chainId = block.chainid;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyVault() {
        if (msg.sender != vault) revert NotVault();
        _;
    }

    function setRecipient(address r, bool allowed) external onlyAdmin {
        if (r == address(0)) revert BadRecipient();
        allowedRecipient[r] = allowed;
        emit RecipientUpdated(r, allowed);
    }

    function escrowBalance() external view returns (uint256) {
        return reserved - settled - refunded;
    }

    function obligationRemaining(bytes32 id) external view returns (uint256) {
        Obligation storage o = obligations[id];
        if (!o.exists) revert UnknownObligation();
        return o.funded - o.settled - o.refunded;
    }

    /// @notice Create a scoped funding obligation. Vault already transferred tokens.
    /// @dev id binds chain, this stream and nonce only; service/recipient/amount are stored.
    function fund(bytes32 serviceId, address recipient, uint256 amount, uint256 nonce, uint256 chain)
        external
        onlyVault
        returns (bytes32 id)
    {
        if (amount == 0) revert ZeroAmount();
        if (!allowedRecipient[recipient]) revert BadRecipient();
        if (address(quote) == recipient) revert BadToken();
        if (chain != chainId || chain != block.chainid) revert BadChain();
        id = keccak256(abi.encode(chainId, address(this), nonce));
        if (obligations[id].exists) revert Replay();
        obligations[id] = Obligation({
            serviceId: serviceId, recipient: recipient, funded: amount, settled: 0, refunded: 0, exists: true
        });
        reserved += amount;
        emit Funded(id, amount, serviceId, recipient);
    }

    /// @notice Settle part or all of an obligation to its STORED recipient.
    function settle(bytes32 id, uint256 amount, uint256 settleNonce) external onlyVault {
        Obligation storage o = obligations[id];
        if (!o.exists) revert UnknownObligation();
        if (amount == 0) revert ZeroAmount();
        if (!allowedRecipient[o.recipient]) revert BadRecipient();
        bytes32 key = keccak256(abi.encode(chainId, address(this), id, settleNonce));
        if (usedSettleNonce[key]) revert Replay();
        usedSettleNonce[key] = true;
        if (amount > o.funded - o.settled - o.refunded) revert Overdraw();
        if (amount > reserved - settled - refunded) revert Overdraw();
        o.settled += amount;
        settled += amount;
        uint256 beforeEscrow = quote.balanceOf(address(this));
        uint256 beforeRecipient = quote.balanceOf(o.recipient);
        quote.safeTransfer(o.recipient, amount);
        if (
            beforeEscrow - quote.balanceOf(address(this)) != amount
                || quote.balanceOf(o.recipient) - beforeRecipient != amount
        ) revert UnsupportedTokenTransfer();
        emit Settled(id, amount, o.serviceId, o.recipient);
    }

    /// @notice Refund part or all of an obligation back to the vault.
    function refund(bytes32 id, uint256 amount, uint256 refundNonce) external onlyVault {
        Obligation storage o = obligations[id];
        if (!o.exists) revert UnknownObligation();
        if (amount == 0) revert ZeroAmount();
        bytes32 key = keccak256(abi.encode(chainId, address(this), id, refundNonce));
        if (usedRefundNonce[key]) revert Replay();
        usedRefundNonce[key] = true;
        if (amount > o.funded - o.settled - o.refunded) revert Overdraw();
        if (amount > reserved - settled - refunded) revert Overdraw();
        o.refunded += amount;
        refunded += amount;
        uint256 beforeEscrow = quote.balanceOf(address(this));
        uint256 beforeVault = quote.balanceOf(vault);
        quote.safeTransfer(vault, amount);
        if (beforeEscrow - quote.balanceOf(address(this)) != amount || quote.balanceOf(vault) - beforeVault != amount) {
            revert UnsupportedTokenTransfer();
        }
        emit Refunded(id, amount);
    }
}
