// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ICreditLine {
    function loanToken() external view returns (IERC20);
    function repayFor(address borrower, uint256 amount) external;
}

/// @notice Shared custody of opt-in repayment budgets. An agent can only repay its bound borrower's debt.
/// @dev Each agent key belongs to one borrower. There is no generic call, native transfer, or admin withdrawal.
contract RepaymentVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public immutable creditLine;

    struct Delegation {
        address borrower;
        uint256 tokenBudget;
        uint256 spentToken;
        uint64 expiresAt;
        bool revoked;
    }

    mapping(address agentKey => Delegation) public delegations;
    mapping(address borrower => uint256) public borrowerBalance;
    uint256 public totalBudgetBalance;

    error InvalidConfiguration();
    error InvalidDelegation();
    error ZeroAmount();
    error InsufficientBalance();
    error AgentKeyAlreadyAssigned();
    error NotYourDelegation();
    error NotAuthorized();
    error BudgetExceeded();
    error UnsupportedTokenTransfer();

    event BudgetDeposited(address indexed borrower, uint256 amount);
    event BudgetWithdrawn(address indexed borrower, uint256 amount);
    event Delegated(
        address indexed borrower, address indexed agentKey, uint256 tokenBudget, uint64 expiresAt
    );
    event Revoked(address indexed borrower, address indexed agentKey);
    event RepaidOnBehalf(address indexed borrower, address indexed agentKey, uint256 amount);

    constructor(IERC20 token_, address creditLine_) {
        if (address(token_).code.length == 0 || creditLine_.code.length == 0) revert InvalidConfiguration();
        if (ICreditLine(creditLine_).loanToken() != token_) revert InvalidConfiguration();
        token = token_;
        creditLine = creditLine_;
        // Trust is restricted to the immutable demo CreditLine, whose repayFor pulls from its caller.
        token_.forceApprove(creditLine_, type(uint256).max);
    }

    function depositBudget(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) != beforeBalance + amount) revert UnsupportedTokenTransfer();
        borrowerBalance[msg.sender] += amount;
        totalBudgetBalance += amount;
        emit BudgetDeposited(msg.sender, amount);
    }

    function withdrawUnusedBudget(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > borrowerBalance[msg.sender]) revert InsufficientBalance();
        borrowerBalance[msg.sender] -= amount;
        totalBudgetBalance -= amount;
        token.safeTransfer(msg.sender, amount);
        emit BudgetWithdrawn(msg.sender, amount);
    }

    function delegate(address agentKey, uint256 tokenBudget, uint64 expiresAt) external nonReentrant {
        if (agentKey == address(0) || tokenBudget == 0 || expiresAt <= block.timestamp) {
            revert InvalidDelegation();
        }
        if (tokenBudget > borrowerBalance[msg.sender]) revert InsufficientBalance();
        address existingBorrower = delegations[agentKey].borrower;
        if (existingBorrower != address(0) && existingBorrower != msg.sender) {
            revert AgentKeyAlreadyAssigned();
        }
        // Explicit borrower renewal grants a fresh cumulative budget; no automatic monthly reset.
        delegations[agentKey] = Delegation(msg.sender, tokenBudget, 0, expiresAt, false);
        emit Delegated(msg.sender, agentKey, tokenBudget, expiresAt);
    }

    function revoke(address agentKey) external nonReentrant {
        Delegation storage d = delegations[agentKey];
        if (d.borrower != msg.sender) revert NotYourDelegation();
        d.revoked = true;
        emit Revoked(msg.sender, agentKey);
    }

    function repayOnBehalf(uint256 amount) external nonReentrant {
        Delegation storage d = delegations[msg.sender];
        if (d.borrower == address(0) || d.revoked || d.expiresAt <= block.timestamp) revert NotAuthorized();
        if (amount == 0) revert ZeroAmount();
        if (amount > d.tokenBudget - d.spentToken) revert BudgetExceeded();
        if (amount > borrowerBalance[d.borrower]) revert InsufficientBalance();
        d.spentToken += amount;
        borrowerBalance[d.borrower] -= amount;
        totalBudgetBalance -= amount;
        uint256 beforeBalance = token.balanceOf(address(this));
        ICreditLine(creditLine).repayFor(d.borrower, amount);
        if (token.balanceOf(address(this)) + amount != beforeBalance) revert UnsupportedTokenTransfer();
        emit RepaidOnBehalf(d.borrower, msg.sender, amount);
    }
}
