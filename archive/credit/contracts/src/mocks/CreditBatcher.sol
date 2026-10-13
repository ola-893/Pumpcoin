// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IBatchCreditLine {
    function borrow(uint256 amount) external;
    function repay(uint256 amount) external;
    function repayFor(address borrower, uint256 amount) external;
    function deposit(uint256 amount) external;
}

/// @notice Test-only router that batches several credit-line actions into one
/// transaction so reconciler regressions run against actual contract events.
/// No financial value; never deploy outside local tests.
contract CreditBatcher {
    function fund(address collateral, address loan, address line, uint256 collateralAmount) external {
        IERC20(collateral).approve(line, collateralAmount);
        IERC20(loan).approve(line, type(uint256).max);
        IBatchCreditLine(line).deposit(collateralAmount);
    }

    /// @notice repayFor, then borrow, then repay: mixed actions in log order.
    function repayForBorrowRepay(address line, address borrower, uint256 repayForAmount, uint256 borrowAmount, uint256 repayAmount)
        external
    {
        IBatchCreditLine(line).repayFor(borrower, repayForAmount);
        IBatchCreditLine(line).borrow(borrowAmount);
        IBatchCreditLine(line).repay(repayAmount);
    }

    /// @notice Two repayFor calls for distinct borrowers in one transaction.
    function repayForTwice(address line, address first, uint256 firstAmount, address second, uint256 secondAmount)
        external
    {
        IBatchCreditLine(line).repayFor(first, firstAmount);
        IBatchCreditLine(line).repayFor(second, secondAmount);
    }
}
