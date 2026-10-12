// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Test-only EIP-7702 delegation target: runs several calls with the
/// signer's own identity (msg.sender stays the EOA) inside ONE transaction,
/// so multi-action single-transaction reconciler regressions use actual
/// contract events. No financial value; never deploy outside local tests.
contract BatchExecutor {
    error BatchFailed(uint256 index);

    function execute(address[] calldata targets, bytes[] calldata datas) external {
        require(targets.length == datas.length, "len");
        for (uint256 i = 0; i < targets.length; i++) {
            (bool ok,) = targets[i].call(datas[i]);
            if (!ok) revert BatchFailed(i);
        }
    }
}
